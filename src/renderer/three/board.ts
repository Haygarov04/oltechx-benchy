import { Box3, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, type WebGLRenderer } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { DetectedPart, PartSlot } from "../../shared/types";
import { chip, gold, labelTexture, pcb } from "./materials";
import { type Model, partModel } from "./models";
import { makeRenderer, studio } from "./stage";

/**
 * The parts of the device on one circuit board, with real physics: they fall into place under gravity
 * and bounce, can be picked up and swung around on a spring, and drop back into their slot.
 * During the check, light pulses run along the traces to the part being tested.
 *
 * The physics is a small rigid-body step written here: gravity, restitution on the board,
 * damped springs for the hand and the slot, and a tilt driven by how fast the part moves.
 */

const BOARD = { width: 27, depth: 18.5, top: 0.3 };
const GRAVITY = -42;
const RESTITUTION = 0.34;
const LIFT = 3.4;

/** Where each kind of part sits on the board and how much room it gets. */
const SLOTS: Record<PartSlot, { at: [number, number][]; size: number }> = {
  cpu: { at: [[-7.2, -3.6]], size: 4.8 },
  gpu: { at: [[-5.2, 4.6]], size: 10.5 },
  ram: { at: [[-0.2, -5.2]], size: 6.8 },
  storage: { at: [[8.6, -5.6], [8.6, -2.4]], size: 6.4 },
  battery: { at: [[8.2, 4.9]], size: 7.4 },
  phone: { at: [[2.6, 3.6]], size: 3.4 },
  motherboard: { at: [], size: 0 },
};
const HUB: [number, number] = [1.6, -0.6];

type Body = {
  index: number;
  slot: PartSlot;
  holder: Group;
  model: Model;
  home: Vector3;
  position: Vector3;
  velocity: Vector3;
  tilt: Vector2;
  tiltSpeed: Vector2;
  dropAt: number;
  half: number;
  settled: boolean;
  trace: { material: MeshStandardMaterial; pulses: Mesh[]; points: Vector3[]; length: number; flash: number };
};

export type BoardState = { active: PartSlot | null; heat: number; paused: boolean };

export class BoardScene {
  private renderer: WebGLRenderer;
  private parts: ReturnType<typeof studio>;
  private camera = new PerspectiveCamera(28, 1, 0.1, 500);
  private bodies: Body[] = [];
  private state: BoardState = { active: null, heat: 0, paused: false };
  private frameId = 0;
  private last = 0;
  private start = performance.now();
  private drawnPaused = false;
  private observer: ResizeObserver;
  private ray = new Raycaster();
  private held: { body: Body; target: Vector3; moved: number; x: number; y: number } | null = null;
  private pointer = new Vector2();
  private look = new Vector2();

  constructor(
    private canvas: HTMLCanvasElement,
    parts: DetectedPart[],
    private onSelect: (index: number) => void,
  ) {
    this.renderer = makeRenderer(canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.parts = studio(this.renderer);
    this.build(parts);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    this.frameId = requestAnimationFrame(this.tick);
  }

  // ── Building the scene ────────────────────────────────────────────────────

  private build(parts: DetectedPart[]) {
    const { scene, key, rim, ground } = this.parts;
    const board = new Mesh(new RoundedBoxGeometry(BOARD.width, BOARD.top, BOARD.depth, 3, 0.12), pcb("#0f2742"));
    board.position.y = BOARD.top / 2;
    board.receiveShadow = true;
    board.castShadow = true;
    scene.add(board);
    // Gold mounting holes in the corners.
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const hole = new Mesh(new BoxGeometry(0.7, 0.02, 0.7), gold());
      hole.position.set(x * (BOARD.width / 2 - 0.9), BOARD.top + 0.01, z * (BOARD.depth / 2 - 0.9));
      scene.add(hole);
    }
    // The hub in the middle: the chip every trace starts from.
    const hub = new Mesh(new RoundedBoxGeometry(3.4, 0.36, 3.4, 3, 0.1), chip());
    hub.position.set(HUB[0], BOARD.top + 0.18, HUB[1]);
    hub.castShadow = true;
    scene.add(hub);
    const name = new Mesh(new BoxGeometry(3.0, 0.002, 1.2), new MeshStandardMaterial({ map: labelTexture([{ text: "OLTechX", size: 150, weight: 800, color: "#e8ecf2" }], 1024, 400), transparent: true, roughness: 0.4 }));
    name.position.set(HUB[0], BOARD.top + 0.365, HUB[1]);
    scene.add(name);
    const pins: Mesh[] = [];
    for (let i = 0; i < 10; i++) for (const side of [-1, 1]) {
      const pin = new Mesh(new BoxGeometry(0.16, 0.08, 0.5), gold());
      pin.position.set(HUB[0] - 1.35 + i * 0.3, BOARD.top + 0.04, HUB[1] + side * 1.85);
      pins.push(pin);
    }
    pins.forEach((pin) => scene.add(pin));

    const used = new Map<PartSlot, number>();
    parts.forEach((part, index) => {
      const slot = SLOTS[part.slot];
      const n = used.get(part.slot) ?? 0;
      const place = slot.at[n];
      if (!place) return;
      used.set(part.slot, n + 1);
      const model = partModel(part);
      // Scale the part to its place and stand it on its own base.
      const box = new Box3().setFromObject(model.group);
      const size = box.getSize(new Vector3());
      const scale = slot.size / Math.max(size.x, size.z);
      model.group.scale.setScalar(scale);
      const center = box.getCenter(new Vector3());
      model.group.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      const holder = new Group();
      holder.add(model.group);
      holder.userData.body = this.bodies.length;
      scene.add(holder);
      const home = new Vector3(place[0], BOARD.top, place[1]);
      const body: Body = {
        index,
        slot: part.slot,
        holder,
        model,
        home,
        position: new Vector3(place[0] + (index % 2 ? 1.5 : -1.5), 13 + index * 2.5, place[1]),
        velocity: new Vector3(),
        tilt: new Vector2((index % 3) * 0.25 - 0.25, index % 2 ? 0.3 : -0.3),
        tiltSpeed: new Vector2(),
        dropAt: 0.25 + this.bodies.length * 0.22,
        half: slot.size / 2,
        settled: false,
        trace: this.trace(home),
      };
      this.bodies.push(body);
    });

    key.position.set(10, 26, 14);
    key.target.position.set(0, 0, 0);
    Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.mapSize.set(2048, 2048);
    rim.position.set(-18, 9, -16);
    ground.scale.setScalar(120);
    ground.position.y = -0.02;
  }

  /** Three parallel traces from the hub to a part, with small lights that travel along them. */
  private trace(home: Vector3) {
    const y = BOARD.top + 0.012;
    const points = [new Vector3(HUB[0], y, HUB[1]), new Vector3(home.x, y, HUB[1]), new Vector3(home.x, y, home.z)];
    const material = new MeshStandardMaterial({ color: "#c9a24a", metalness: 1, roughness: 0.3, emissive: new Color("#3b7bff"), emissiveIntensity: 0.15 });
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const span = a.distanceTo(b);
      if (span < 0.01) continue;
      length += span;
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
      for (const offset of [-0.2, 0, 0.2]) {
        const line = new Mesh(new BoxGeometry(alongX ? span + 0.4 : 0.07, 0.012, alongX ? 0.07 : span + 0.4), material);
        line.position.set((a.x + b.x) / 2 + (alongX ? 0 : offset), y, (a.z + b.z) / 2 + (alongX ? offset : 0));
        this.parts.scene.add(line);
      }
    }
    const pulses = [0, 1, 2].map(() => {
      const pulse = new Mesh(new BoxGeometry(0.5, 0.05, 0.5), new MeshStandardMaterial({ color: "#000", emissive: new Color("#6fa3ff"), emissiveIntensity: 3 }));
      this.parts.scene.add(pulse);
      return pulse;
    });
    return { material, pulses, points, length: Math.max(length, 0.01), flash: 0 };
  }

  // ── Physics ───────────────────────────────────────────────────────────────

  private step(body: Body, time: number, dt: number) {
    if (time < body.dropAt) return;
    const held = this.held?.body === body ? this.held : null;
    const p = body.position;
    const v = body.velocity;
    if (held) {
      // The hand is a spring: the part follows with weight and swings a little.
      v.x += (140 * (held.target.x - p.x) - 13 * v.x) * dt;
      v.y += (140 * (held.target.y - p.y) - 13 * v.y) * dt;
      v.z += (140 * (held.target.z - p.z) - 13 * v.z) * dt;
      body.settled = false;
    } else {
      // The slot pulls it back sideways while gravity brings it down.
      v.x += (70 * (body.home.x - p.x) - 11 * v.x) * dt;
      v.z += (70 * (body.home.z - p.z) - 11 * v.z) * dt;
      if (!body.settled) v.y += GRAVITY * dt;
    }
    p.addScaledVector(v, dt);
    if (p.y <= body.home.y) {
      p.y = body.home.y;
      if (v.y < -2.2) {
        // A bounce: it loses most of its speed and gets a small knock sideways.
        body.tiltSpeed.x += v.y * 0.05 * (body.index % 2 ? 1 : -1);
        body.tiltSpeed.y += v.y * 0.04;
        v.y = -v.y * RESTITUTION;
      } else if (!held) {
        if (!body.settled && Math.abs(v.y) > 0.01) body.trace.flash = 1;
        v.y = 0;
        body.settled = Math.abs(p.x - body.home.x) < 0.02 && Math.abs(p.z - body.home.z) < 0.02;
      }
    }
    // It leans against the direction it moves, and a spring sets it level again.
    const lift = Math.min(1, (p.y - body.home.y) / 1.5);
    const want = new Vector2(Math.max(-0.32, Math.min(0.32, v.z * 0.03)) * lift, Math.max(-0.32, Math.min(0.32, -v.x * 0.03)) * lift);
    body.tiltSpeed.x += (95 * (want.x - body.tilt.x) - 13 * body.tiltSpeed.x) * dt;
    body.tiltSpeed.y += (95 * (want.y - body.tilt.y) - 13 * body.tiltSpeed.y) * dt;
    body.tilt.addScaledVector(body.tiltSpeed, dt);
    // A part never tips over: past a quarter of a turn of lean it stops, like against a stop.
    for (const axis of ["x", "y"] as const) {
      if (Math.abs(body.tilt[axis]) > 0.38) {
        body.tilt[axis] = Math.sign(body.tilt[axis]) * 0.38;
        body.tiltSpeed[axis] *= -0.2;
      }
    }
    // A leaning part rests on its lower edge instead of sinking into the board.
    const edge = (Math.abs(Math.sin(body.tilt.x)) + Math.abs(Math.sin(body.tilt.y))) * body.half;
    body.holder.position.set(p.x, p.y + edge, p.z);
    body.holder.rotation.set(body.tilt.x, 0, body.tilt.y);
  }

  private pulse(body: Body, time: number, dt: number) {
    const { trace } = body;
    const active = this.state.active === body.slot;
    trace.flash = Math.max(0, trace.flash - dt * 2.2);
    trace.material.emissiveIntensity = 0.12 + (active ? 0.9 + 0.3 * Math.sin(time * 6) : 0) + trace.flash * 1.6;
    trace.material.emissive.set(active && this.state.heat > 0.6 ? "#ff8a3d" : "#3b7bff");
    const speed = active ? 9 : 1.6;
    trace.pulses.forEach((pulse, i) => {
      const along = ((time * speed + (i * trace.length) / 3 + body.index * 1.7) % trace.length) / trace.length;
      let rest = along * trace.length;
      let placed = false;
      for (let s = 0; s < trace.points.length - 1 && !placed; s++) {
        const a = trace.points[s];
        const b = trace.points[s + 1];
        const span = a.distanceTo(b);
        if (rest <= span || s === trace.points.length - 2) {
          pulse.position.lerpVectors(a, b, span > 0 ? Math.min(1, rest / span) : 0);
          placed = true;
        }
        rest -= span;
      }
      pulse.position.y = BOARD.top + 0.03;
      pulse.visible = body.settled && (active || i === 0);
      (pulse.material as MeshStandardMaterial).emissiveIntensity = active ? 5 : 1.6;
    });
  }

  // ── The hand ──────────────────────────────────────────────────────────────

  private aim(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
  }

  private pick(): Body | null {
    const hit = this.ray.intersectObjects(this.bodies.map((b) => b.holder), true)[0];
    if (!hit) return null;
    let object: typeof hit.object | null = hit.object;
    while (object && object.userData.body === undefined) object = object.parent;
    return object ? this.bodies[object.userData.body as number] : null;
  }

  private onDown = (event: PointerEvent) => {
    this.aim(event);
    const body = this.pick();
    if (!body) return;
    this.held = { body, target: body.position.clone().setY(body.home.y + LIFT), moved: 0, x: event.clientX, y: event.clientY };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Some pointers cannot be captured; dragging inside the canvas still works.
    }
    this.drawnPaused = false;
    this.canvas.style.cursor = "grabbing";
  };

  private onMove = (event: PointerEvent) => {
    this.aim(event);
    this.look.copy(this.pointer);
    if (!this.held) {
      this.canvas.style.cursor = this.pick() ? "grab" : "default";
      return;
    }
    this.held.moved += Math.abs(event.clientX - this.held.x) + Math.abs(event.clientY - this.held.y);
    this.held.x = event.clientX;
    this.held.y = event.clientY;
    // The hand moves in a level plane above the board.
    const point = this.ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -(this.held.body.home.y + LIFT)), new Vector3());
    if (point) this.held.target.set(Math.max(-16, Math.min(16, point.x)), this.held.body.home.y + LIFT, Math.max(-11, Math.min(11, point.z)));
    this.drawnPaused = false;
  };

  private onUp = () => {
    if (!this.held) return;
    const { body, moved } = this.held;
    this.held = null;
    this.canvas.style.cursor = "grab";
    if (moved < 6) this.onSelect(body.index);
  };

  // ── Drawing ───────────────────────────────────────────────────────────────

  setState(state: Partial<BoardState>) {
    if (state.paused === false) this.drawnPaused = false;
    Object.assign(this.state, state);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.place();
    this.drawnPaused = false;
  }

  /** The camera looks down at the board from the front and backs off until all of it fits. */
  private place() {
    const elevation = (50 * Math.PI) / 180;
    const azimuth = (16 * Math.PI) / 180 + this.look.x * 0.05;
    const direction = new Vector3(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation) + this.look.y * 0.03, Math.cos(elevation) * Math.cos(azimuth)).normalize();
    const center = new Vector3(0, 1.2, 0.4);
    const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, 4].map((y) => new Vector3((x * BOARD.width) / 2, y, (z * BOARD.depth) / 2))));
    let distance = 60;
    for (let pass = 0; pass < 4; pass++) {
      this.camera.position.copy(center).addScaledVector(direction, distance);
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let extent = 0;
      for (const corner of corners) {
        const projected = corner.clone().project(this.camera);
        extent = Math.max(extent, Math.abs(projected.x), Math.abs(projected.y));
      }
      distance *= extent / 0.93;
    }
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
  }

  private tick = (now: number) => {
    this.frameId = requestAnimationFrame(this.tick);
    const moving = this.held || this.bodies.some((b) => !b.settled);
    // While the graphics card and the RAM are measured the picture stops, unless a part is in the air.
    if (this.state.paused && this.drawnPaused && !moving) return;
    if (now - this.last < 1000 / 60) return;
    const delta = Math.min(1 / 20, (now - (this.last || now)) / 1000);
    this.last = now;
    const time = (now - this.start) / 1000;
    // Two physics steps a frame keep the springs stable.
    for (const body of this.bodies) {
      this.step(body, time, delta / 2);
      this.step(body, time, delta / 2);
      this.pulse(body, time, delta);
      body.model.animate?.(time, delta, { active: this.state.active === body.slot, heat: this.state.heat });
    }
    this.place();
    this.renderer.render(this.parts.scene, this.camera);
    this.drawnPaused = this.state.paused;
  };

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.renderer.dispose();
  }
}
