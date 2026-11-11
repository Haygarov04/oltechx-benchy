import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  Sphere,
  SRGBColorSpace,
  type Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Model, ModelState } from "./models";

/**
 * A small photo studio for the models: soft room light for reflections, a key light with a soft
 * shadow and a cool rim light. Used live (animated) and for still pictures of the parts.
 */

const environments = new WeakMap<WebGLRenderer, Texture>();

/** The room that the metal reflects. Made once for each renderer. */
function environment(renderer: WebGLRenderer) {
  let texture = environments.get(renderer);
  if (!texture) {
    const pmrem = new PMREMGenerator(renderer);
    texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    environments.set(renderer, texture);
  }
  return texture;
}

function studio(renderer: WebGLRenderer) {
  const scene = new Scene();
  scene.environment = environment(renderer);
  scene.add(new HemisphereLight("#ffffff", "#3a3f48", 0.5));
  const key = new DirectionalLight("#ffffff", 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  scene.add(key);
  scene.add(key.target);
  const rim = new DirectionalLight("#9fb8ff", 1.1);
  scene.add(rim);
  const ground = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return { scene, key, rim, ground };
}

function makeRenderer(canvas?: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !canvas, powerPreference: "low-power" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

/** Places the model on the floor and points the camera so it fills the frame. */
function frame(model: Model, parts: ReturnType<typeof studio>, camera: PerspectiveCamera, aspect: number, fillScale = 1) {
  const { scene, key, rim, ground } = parts;
  scene.add(model.group);
  const bounds = new Box3().setFromObject(model.group);
  model.group.position.y -= bounds.min.y;
  bounds.setFromObject(model.group);
  const sphere = bounds.getBoundingSphere(new Sphere());
  const azimuth = ((model.view?.azimuth ?? 32) * Math.PI) / 180;
  const elevation = ((model.view?.elevation ?? 32) * Math.PI) / 180;
  const fill = (model.view?.fill ?? 0.9) * fillScale;
  camera.aspect = aspect;
  const vertical = (camera.fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  let distance = sphere.radius / Math.sin(Math.min(vertical, horizontal));
  const direction = new Vector3(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));
  // Fit the real outline, not the bounding sphere: flat parts would otherwise look tiny.
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z));
  const center = bounds.getCenter(new Vector3());
  for (let pass = 0; pass < 4; pass++) {
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = distance / 50;
    camera.far = distance * 10;
    camera.lookAt(center);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let extent = 0;
    for (const corner of corners) {
      const p = corner.clone().project(camera);
      extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
    }
    distance *= extent / fill;
  }
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = distance / 50;
  camera.far = distance * 10;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  const r = sphere.radius;
  key.position.set(sphere.center.x + r * 1.4, sphere.center.y + r * 2.6, sphere.center.z + r * 1.6);
  key.target.position.copy(sphere.center);
  Object.assign(key.shadow.camera, { left: -r * 1.6, right: r * 1.6, top: r * 1.6, bottom: -r * 1.6, near: 0.1, far: r * 8 });
  key.shadow.camera.updateProjectionMatrix();
  rim.position.set(sphere.center.x - r * 2, sphere.center.y + r, sphere.center.z - r * 2);
  ground.scale.setScalar(r * 6);
  ground.position.set(sphere.center.x, 0, sphere.center.z);
}

// ── Still pictures ──────────────────────────────────────────────────────────

let still: { renderer: WebGLRenderer; parts: ReturnType<typeof studio>; camera: PerspectiveCamera } | null = null;
const pictures = new Map<string, string>();

/** A still picture of a model, as a data URL. One shared renderer makes all of them. */
export async function picture(key: string, build: () => Model, width = 360, height = 276): Promise<string> {
  const cached = pictures.get(key);
  if (cached) return cached;
  await document.fonts.ready;
  if (!still) {
    const renderer = makeRenderer();
    still = { renderer, parts: studio(renderer), camera: new PerspectiveCamera(30, 1, 0.1, 1000) };
  }
  const { renderer, parts, camera } = still;
  renderer.setSize(width, height, false);
  const model = build();
  frame(model, parts, camera, width / height);
  model.animate?.(0, 0, { active: false, heat: 0 });
  renderer.render(parts.scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  parts.scene.remove(model.group);
  pictures.set(key, url);
  return url;
}

// ── Turntables ──────────────────────────────────────────────────────────────

type Spin = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; model: Model; parts: ReturnType<typeof studio>; camera: PerspectiveCamera; offset: number };

let table: { renderer: WebGLRenderer; spins: Spin[]; cursor: number; frame: number; last: number } | null = null;

function turn(now: number) {
  if (!table) return;
  table.frame = table.spins.length ? requestAnimationFrame(turn) : 0;
  if (now - table.last < 1000 / 30 || !table.spins.length) return;
  const delta = Math.min(0.2, (now - table.last) / 1000);
  table.last = now;
  // Two parts a frame: with six cards each one still moves about ten times a second.
  for (let n = 0; n < Math.min(2, table.spins.length); n++) {
    table.cursor = (table.cursor + 1) % table.spins.length;
    const spin = table.spins[table.cursor];
    const { width, height } = spin.canvas;
    if (!width || !height) continue;
    const time = now / 1000;
    spin.model.group.rotation.y = time * 0.45 + spin.offset;
    spin.model.animate?.(time, delta * table.spins.length * 0.5, { active: false, heat: 0 });
    table.renderer.setSize(width, height, false);
    table.renderer.render(spin.parts.scene, spin.camera);
    spin.context.clearRect(0, 0, width, height);
    spin.context.drawImage(table.renderer.domElement, 0, 0);
  }
}

/**
 * A part slowly turning in a small canvas. All turntables share one renderer and take turns,
 * so a page full of parts costs one graphics context. Returns a function that removes it.
 */
export function turntable(canvas: HTMLCanvasElement, build: () => Model): () => void {
  if (!table) table = { renderer: makeRenderer(), spins: [], cursor: 0, frame: 0, last: 0 };
  const current = table;
  const ratio = Math.min(window.devicePixelRatio, 2);
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  const context = canvas.getContext("2d");
  if (!context || !canvas.width) return () => undefined;
  const model = build();
  const parts = studio(current.renderer);
  const camera = new PerspectiveCamera(30, 1, 0.1, 1000);
  // Framed at the widest angle, so nothing leaves the picture while it turns.
  const view = model.view ?? {};
  model.view = { ...view, elevation: view.elevation ?? 32, azimuth: 45 };
  frame(model, parts, camera, canvas.width / canvas.height, 0.8);
  const spin: Spin = { canvas, context, model, parts, camera, offset: current.spins.length * 0.9 };
  current.spins.push(spin);
  if (!current.frame) current.frame = requestAnimationFrame(turn);
  return () => {
    current.spins = current.spins.filter((s) => s !== spin);
  };
}

// ── Live view ───────────────────────────────────────────────────────────────

/**
 * A live, animated view, at most 30 frames a second. While the graphics card and the RAM are measured
 * ("slow") it draws one frame and stops, so the picture takes no speed away from the test.
 */
export class LiveStage {
  private renderer: WebGLRenderer;
  private parts: ReturnType<typeof studio>;
  private camera = new PerspectiveCamera(30, 1, 0.1, 1000);
  private model: Model | null = null;
  private state: ModelState & { slow: boolean; sway: boolean } = { active: false, heat: 0, slow: false, sway: true };
  private yaw = 0;
  private spinSpeed = 0;
  private frameId = 0;
  private drawnSlow = false;
  private last = 0;
  private start = performance.now();
  private observer: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = makeRenderer(canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.parts = studio(this.renderer);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.frameId = requestAnimationFrame(this.tick);
  }

  setModel(model: Model) {
    if (this.model) this.parts.scene.remove(this.model.group);
    this.drawnSlow = false;
    this.model = model;
    this.resize();
  }

  setState(state: Partial<LiveStage["state"]>) {
    if (state.slow === false) this.drawnSlow = false;
    Object.assign(this.state, state);
  }

  /** Turning the model by hand: pixels dragged, and how fast, for the coast afterwards. */
  drag(pixels: number, speed = 0) {
    this.yaw += pixels * 0.012;
    this.spinSpeed = speed * 0.012;
    this.drawnSlow = false;
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    if (this.model) {
      this.model.group.rotation.y = 0;
      frame(this.model, this.parts, this.camera, w / h, 0.86);
    }
  }

  private tick = (now: number) => {
    this.frameId = requestAnimationFrame(this.tick);
    if (this.state.slow && this.drawnSlow) return;
    if (now - this.last < 1000 / 30) return;
    this.drawnSlow = this.state.slow;
    const delta = Math.min(0.2, (now - (this.last || now)) / 1000);
    this.last = now;
    const time = (now - this.start) / 1000;
    if (this.model) {
      // A slow turn back and forth, like a product on a turntable.
      // After a drag it keeps turning for a moment, like something with weight.
      this.yaw += this.spinSpeed * delta;
      this.spinSpeed *= Math.pow(0.04, delta);
      if (this.state.sway) this.model.group.rotation.y = Math.sin(time * 0.35) * 0.32 + this.yaw;
      this.model.animate?.(time, delta, this.state);
    }
    this.renderer.render(this.parts.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.renderer.dispose();
  }
}
