import { Box3, BoxGeometry, Color, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, Plane, PlaneGeometry, PointLight, Raycaster, SRGBColorSpace, TextureLoader, Vector2, Vector3, type WebGLRenderer } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { DetectedPart, PartSlot } from "../../shared/types";
import boardPhoto from "../assets/renders/board.webp";
import { canvasTexture, chip, FONT, glow, gold, labelTexture, MONO, plastic } from "./materials";
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

const TOP = 0.3;
const GRAVITY = -42;
const RESTITUTION = 0.34;
const LIFT = 3.4;

type Place = { at: [number, number][]; size: number; turn?: number };

/**
 * One board for each kind of device, because they look nothing alike inside:
 * a desktop has the big motherboard from oltechx.com, a laptop or a Mac has a flat logic board
 * with a large battery, and a phone has a narrow board with the battery below it.
 */
export type BoardKind = "desktop" | "laptop" | "phone";

type Layout = { width: number; depth: number; hub: [number, number]; hubScale: number; photo: boolean; slots: Record<PartSlot, Place> };

/** Places on the desktop board come from the picture: pixel (x, y) of 1000 × 960. */
const DESK = { width: 27, depth: 25.92 };
const px = (x: number, y: number): [number, number] => [(x / 1000 - 0.5) * DESK.width, (y / 960 - 0.5) * DESK.depth];

/** Apple silicon: processor, graphics and memory are one chip, so they sit on the board as one part. */
export const isAppleSilicon = (parts: DetectedPart[]) => parts.some((p) => p.slot === "cpu" && /^apple\s+m\d/i.test(p.name));

const LAYOUTS: Record<BoardKind | "mac", Layout> = {
  mac: {
    width: 27,
    depth: 18.5,
    hub: [11.2, 4.4],
    hubScale: 0.8,
    photo: false,
    slots: {
      cpu: { at: [[-7.4, -4.4]], size: 8.2 },
      storage: { at: [[6.4, -5.0], [6.4, -1.9]], size: 6.4 },
      battery: { at: [[-2.0, 4.6]], size: 15 },
      gpu: { at: [], size: 0 },
      ram: { at: [], size: 0 },
      phone: { at: [], size: 0 },
      motherboard: { at: [], size: 0 },
    },
  },
  desktop: {
    ...DESK,
    hub: px(708, 834),
    hubScale: 0,
    photo: true,
    slots: {
      cpu: { at: [px(412, 290)], size: 6 },
      ram: { at: [px(675, 268)], size: 13.4, turn: Math.PI / 2 },
      storage: { at: [px(362, 465), px(919, 615)], size: 9.4 },
      gpu: { at: [px(254, 590)], size: 10.6 },
      battery: { at: [], size: 0 },
      phone: { at: [], size: 0 },
      motherboard: { at: [], size: 0 },
    },
  },
  laptop: {
    width: 27,
    depth: 18.5,
    hub: [11.2, 4.4],
    hubScale: 0.8,
    photo: false,
    slots: {
      cpu: { at: [[-9.4, -4.9]], size: 5.4 },
      gpu: { at: [[-3.4, -5.1]], size: 4.4 },
      ram: { at: [[2.6, -5.0]], size: 6 },
      storage: { at: [[9.4, -5.2], [9.4, -1.6]], size: 6.2 },
      battery: { at: [[-2.6, 3.9]], size: 16 },
      phone: { at: [], size: 0 },
      motherboard: { at: [], size: 0 },
    },
  },
  phone: {
    width: 14,
    depth: 25,
    hub: [0, -11],
    hubScale: 0.62,
    photo: false,
    slots: {
      cpu: { at: [[-3, -6.6]], size: 4.6 },
      gpu: { at: [[3, -6.6]], size: 4.2 },
      ram: { at: [[-3, -1.4]], size: 4.6 },
      storage: { at: [[3, -1.4]], size: 4.4 },
      battery: { at: [[0, 6.6]], size: 10.5, turn: Math.PI / 2 },
      phone: { at: [], size: 0 },
      motherboard: { at: [], size: 0 },
    },
  },
};

/**
 * A logic board drawn in detail: dense traces, vias, rows of tiny components, shielding cans,
 * white markings and a marked footprint under every part. Dark, like the board on the site.
 */
type Placed = { index: number; part: DetectedPart; place: [number, number]; slot: Place };

function logicBoardTexture(kind: BoardKind, layout: Layout, placed: Placed[]) {
  const scale = 76;
  return canvasTexture(Math.round(layout.width * scale), Math.round(layout.depth * scale), (ctx, w, h) => {
    const X = (x: number) => (x / layout.width + 0.5) * w;
    const Z = (z: number) => (z / layout.depth + 0.5) * h;
    let seed = kind === "phone" ? 977 : 4242;
    const next = (n: number) => (seed = (seed * 16807) % 2147483647) % n;
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, "#0b111c");
    base.addColorStop(1, "#070b13");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Copper under the mask: long runs with 45-degree bends.
    ctx.lineCap = "round";
    for (let i = 0; i < 420; i++) {
      ctx.strokeStyle = `rgba(90,140,220,${0.05 + next(10) / 100})`;
      ctx.lineWidth = 1 + next(3) * 0.6;
      let x = next(w);
      let y = next(h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        const len = 30 + next(170);
        const dir = next(4);
        x += dir === 0 ? len : dir === 1 ? -len : dir === 2 ? len * 0.7 : 0;
        y += dir === 2 ? len * 0.7 : dir === 3 ? len : 0;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(200,170,95,0.7)";
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Rows of tiny capacitors and resistors.
    for (let i = 0; i < 90; i++) {
      const x = next(w - 80) + 20;
      const y = next(h - 40) + 20;
      const across = next(2) === 0;
      const count = 3 + next(9);
      for (let k = 0; k < count; k++) {
        ctx.fillStyle = next(3) === 0 ? "#3a3326" : "#22262e";
        const cx = x + (across ? k * 13 : 0);
        const cy = y + (across ? 0 : k * 13);
        ctx.fillRect(cx, cy, across ? 9 : 5, across ? 5 : 9);
        ctx.fillStyle = "#8d8a80";
        ctx.fillRect(cx, cy, across ? 2 : 5, across ? 5 : 2);
        ctx.fillRect(cx + (across ? 7 : 0), cy + (across ? 0 : 7), across ? 2 : 5, across ? 5 : 2);
      }
    }
    // Shielding cans and small chips with white markings.
    ctx.font = `600 11px ${MONO}`;
    for (let i = 0; i < 16; i++) {
      const cw = 60 + next(120);
      const ch = 44 + next(80);
      const x = next(w - cw - 40) + 20;
      const y = next(h - ch - 40) + 20;
      const can = next(3) === 0;
      ctx.fillStyle = can ? "#3b414b" : "#12151b";
      ctx.strokeStyle = can ? "#5a626e" : "#2a2f38";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(230,235,245,0.55)";
      ctx.fillText(`U${10 + i}`, x + 6, y - 5);
    }
    // The battery bay: a recess with its outline and connector.
    for (const [bx, bz] of placed.filter((p) => p.part.slot === "battery").map((p) => p.place)) {
      const turned = Boolean(layout.slots.battery.turn);
      const bw = (turned ? 0.52 : 1.04) * layout.slots.battery.size * scale;
      const bh = (turned ? 1.04 : 0.5) * layout.slots.battery.size * scale;
      ctx.fillStyle = "#04060a";
      ctx.strokeStyle = "rgba(111,163,255,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(X(bx) - bw / 2, Z(bz) - bh / 2, bw, bh, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(230,235,245,0.6)";
      ctx.fillText("BATT", X(bx) - bw / 2 + 14, Z(bz) - bh / 2 + 22);
    }
    // A footprint with pads under every part that is really there, so each one lands on its own place.
    for (const { part, place, slot } of placed) {
      if (part.slot === "battery") continue;
      const [sx, sz] = place;
      const half = (slot.size * scale) / 2;
      const apple = part.slot === "cpu" && /^apple/i.test(part.name);
      const fw = half * (part.slot === "storage" ? 1.05 : 1.08);
      const fh = half * (part.slot === "storage" ? 0.36 : part.slot === "ram" ? 0.75 : apple ? 0.88 : 1.08);
      ctx.fillStyle = "#0e141f";
      ctx.strokeStyle = "rgba(230,235,245,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(X(sx) - fw, Z(sz) - fh, fw * 2, fh * 2, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c9a24a";
      for (let k = 0; k < 22; k++) {
        const t = -fw + 10 + ((fw * 2 - 20) / 21) * k;
        ctx.fillRect(X(sx) + t - 2, Z(sz) - fh - 7, 4, 6);
        ctx.fillRect(X(sx) + t - 2, Z(sz) + fh + 1, 4, 6);
      }
      ctx.fillStyle = "rgba(230,235,245,0.6)";
      ctx.fillText(apple ? "SOC" : part.slot.toUpperCase(), X(sx) - fw, Z(sz) - fh - 12);
    }
    // Gold mounting holes and the maker's name.
    for (const [hx, hz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = X((hx * layout.width) / 2) - hx * 42;
      const cy = Z((hz * layout.depth) / 2) - hz * 42;
      ctx.fillStyle = "#c9a24a";
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#020305";
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(230,235,245,0.75)";
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(kind === "phone" ? "OLTECHX P1" : "OLTECHX L1 LOGIC", 80, h - 34);
  });
}

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
  private kind: BoardKind;
  private L: Layout;
  private apple = false;

  /** The part under test glows. On Apple silicon the graphics and memory tests light the chip. */
  private isActive(body: Body) {
    const active = this.state.active;
    return active === body.slot || (this.apple && body.slot === "cpu" && (active === "gpu" || active === "ram"));
  }

  /** Which part goes where on this board. On Apple silicon the graphics and memory live in the chip. */
  private placements(parts: DetectedPart[]): Placed[] {
    const used = new Map<PartSlot, number>();
    const placed: Placed[] = [];
    parts.forEach((part, index) => {
      if (this.apple && (part.slot === "gpu" || part.slot === "ram")) return;
      const slot = this.L.slots[part.slot];
      const n = used.get(part.slot) ?? 0;
      const place = slot.at[n];
      if (!place) return;
      used.set(part.slot, n + 1);
      // The chip carries the size of its memory, printed on the memory packages.
      const ram = parts.find((p) => p.slot === "ram");
      const shown = this.apple && part.slot === "cpu" && ram ? { ...part, specs: { ...part.specs, unifiedGb: ram.specs.capacityGb ?? null } } : part;
      placed.push({ index, part: shown, place, slot });
    });
    return placed;
  }

  constructor(
    private canvas: HTMLCanvasElement,
    parts: DetectedPart[],
    private onSelect: (index: number) => void,
    kind: BoardKind = "laptop",
  ) {
    this.kind = kind;
    this.apple = kind !== "desktop" && isAppleSilicon(parts);
    this.L = this.apple ? LAYOUTS.mac : LAYOUTS[kind];
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
    const L = this.L;
    const body = new Mesh(new RoundedBoxGeometry(L.width, TOP, L.depth, 3, 0.12), plastic("#06090f", 0.6));
    body.position.y = TOP / 2;
    body.receiveShadow = true;
    body.castShadow = true;
    scene.add(body);
    // The face of the board: the rendered motherboard for a desktop, a drawn logic board otherwise.
    const placed = this.placements(parts);
    const map = L.photo ? new TextureLoader().load(boardPhoto, () => (this.drawnPaused = false)) : logicBoardTexture(this.kind, L, placed);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
    const face = new Mesh(new PlaneGeometry(L.width, L.depth), new MeshPhysicalMaterial({ map, roughness: 0.5, metalness: 0.15, clearcoat: 0.45, clearcoatRoughness: 0.4 }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = TOP + 0.004;
    face.receiveShadow = true;
    scene.add(face);
    // The hub every trace starts from. On the desktop board it is already in the picture.
    if (L.hubScale > 0) {
      const hub = new Group();
      const chipMesh = new Mesh(new RoundedBoxGeometry(3.4, 0.36, 3.4, 3, 0.1), chip());
      chipMesh.position.y = 0.18;
      chipMesh.castShadow = true;
      hub.add(chipMesh);
      const mark = new Mesh(new BoxGeometry(2.0, 0.002, 2.0), new MeshStandardMaterial({ map: labelTexture([{ text: "X", size: 380, weight: 800, color: "#8fd0ff" }], 512, 512), transparent: true, emissive: new Color("#3b9bff"), emissiveIntensity: 1.6, emissiveMap: labelTexture([{ text: "X", size: 380, weight: 800, color: "#ffffff" }], 512, 512) }));
      mark.position.y = 0.365;
      hub.add(mark);
      hub.scale.setScalar(L.hubScale);
      hub.position.set(L.hub[0], TOP, L.hub[1]);
      scene.add(hub);
    }
    const hubGlow = new PointLight("#3b9bff", 26, 9, 1.8);
    hubGlow.position.set(L.hub[0], TOP + 1.4, L.hub[1]);
    scene.add(hubGlow);

    for (const { index, part, place, slot } of placed) {
      const model = partModel(part);
      if (slot.turn) {
        // Some parts lie the other way on this board, like memory in its slots.
        const turned = new Group();
        turned.add(model.group);
        turned.rotation.y = slot.turn;
        model.group = turned;
      }
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
      const home = new Vector3(place[0], TOP, place[1]);
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
    }

    key.intensity = 1.7;
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
    const y = TOP + 0.014;
    const hub = this.L.hub;
    const points = [new Vector3(hub[0], y, hub[1]), new Vector3(home.x, y, hub[1]), new Vector3(home.x, y, home.z)];
    const material = new MeshStandardMaterial({ color: "#0b1830", metalness: 0.4, roughness: 0.4, emissive: new Color("#3b9bff"), emissiveIntensity: 0.5 });
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const span = a.distanceTo(b);
      if (span < 0.01) continue;
      length += span;
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
      for (const offset of [-0.14, 0, 0.14]) {
        const line = new Mesh(new BoxGeometry(alongX ? span + 0.28 : 0.045, 0.01, alongX ? 0.045 : span + 0.28), material);
        line.position.set((a.x + b.x) / 2 + (alongX ? 0 : offset), y, (a.z + b.z) / 2 + (alongX ? offset : 0));
        this.parts.scene.add(line);
      }
    }
    const pulses = [0, 1, 2].map(() => {
      const pulse = new Mesh(new BoxGeometry(0.42, 0.04, 0.42), glow("#8fd0ff", 4));
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
    const active = this.isActive(body);
    trace.flash = Math.max(0, trace.flash - dt * 2.2);
    trace.material.emissiveIntensity = 0.45 + (active ? 0.9 + 0.3 * Math.sin(time * 6) : 0) + trace.flash * 1.6;
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
      pulse.position.y = TOP + 0.03;
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
    const reach = [this.L.width / 2 + 2.5, this.L.depth / 2 + 2];
    if (point) this.held.target.set(Math.max(-reach[0], Math.min(reach[0], point.x)), this.held.body.home.y + LIFT, Math.max(-reach[1], Math.min(reach[1], point.z)));
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
    // Nearly straight from the front and above, so the board fills the frame; the pointer tilts it a little.
    const elevation = (56 * Math.PI) / 180;
    const azimuth = this.look.x * 0.06;
    const direction = new Vector3(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation) + this.look.y * 0.03, Math.cos(elevation) * Math.cos(azimuth)).normalize();
    const center = new Vector3(0, 0.6, 0.2);
    const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, 4].map((y) => new Vector3((x * this.L.width) / 2, y, (z * this.L.depth) / 2))));
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
      distance *= extent / 0.97;
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
      body.model.animate?.(time, delta, { active: this.isActive(body), heat: this.state.heat });
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
