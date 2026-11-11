import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Shape,
  ShapeGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { DetectedPart, Hardware } from "../../shared/types";
import { aluminium, canvasTexture, chip, FONT, glass, glow, gold, gunmetal, labelTexture, metal, MONO, pcb, plastic, screenTexture } from "./materials";

/**
 * 3D models of the real parts and devices, built from simple shapes. Proportions follow the real
 * hardware; the materials and the light make them look real. Each model can animate: fans spin,
 * a hot processor glows, RGB lights cycle.
 */

export type ModelState = { active: boolean; heat: number };
export type Model = { group: Group; animate?: (time: number, delta: number, state: ModelState) => void; view?: { azimuth?: number; elevation?: number; fill?: number } };

// ── Helpers ─────────────────────────────────────────────────────────────────

function box(w: number, h: number, d: number, material: Material, radius = 0) {
  const geometry = radius > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2)) : new BoxGeometry(w, h, d);
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function at<T extends { position: { set: (x: number, y: number, z: number) => void } }>(object: T, x: number, y: number, z: number): T {
  object.position.set(x, y, z);
  return object;
}

/** A flat label lying on top of something (facing up). */
function topLabel(texture: ReturnType<typeof labelTexture>, w: number, d: number, options: { metalness?: number; roughness?: number } = {}) {
  const mesh = new Mesh(new PlaneGeometry(w, d), new MeshStandardMaterial({ map: texture, transparent: true, metalness: options.metalness ?? 0, roughness: options.roughness ?? 0.6 }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Many identical small parts (contacts, pads) in one draw. */
function instanced(geometry: BoxGeometry, material: Material, positions: [number, number, number][]) {
  const mesh = new InstancedMesh(geometry, material, positions.length);
  const matrix = new Matrix4();
  positions.forEach(([x, y, z], i) => mesh.setMatrixAt(i, matrix.makeTranslation(x, y, z)));
  mesh.castShadow = true;
  return mesh;
}

const hueCycle = (time: number, offset = 0) => new Color().setHSL(((time * 0.08 + offset) % 1 + 1) % 1, 0.85, 0.55);

// ── Fan ─────────────────────────────────────────────────────────────────────

/** A fan lying flat (facing up): frame ring, nine curved blades and a hub. Spins with a motion blur. */
function fan(radius: number, ringColor: string | null = null) {
  const group = new Group();
  const well = new Mesh(new CylinderGeometry(radius * 1.02, radius * 1.02, 0.04, 48), plastic("#08090b", 0.9));
  group.add(well);
  const ringMaterial = ringColor ? glow(ringColor, 1.8) : plastic("#101215", 0.4);
  const ring = new Mesh(new TorusGeometry(radius * 1.03, radius * 0.045, 12, 64), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  const rotor = new Group();
  rotor.position.y = 0.05;
  const hub = radius * 0.3;
  const blade = new Shape();
  blade.moveTo(hub, -radius * 0.08);
  blade.quadraticCurveTo(radius * 0.62, -radius * 0.3, radius * 0.96, -radius * 0.02);
  blade.quadraticCurveTo(radius * 0.72, radius * 0.24, hub, radius * 0.16);
  blade.closePath();
  const bladeGeometry = new ExtrudeGeometry(blade, { depth: radius * 0.012, bevelEnabled: false });
  bladeGeometry.rotateX(-Math.PI / 2);
  bladeGeometry.rotateX(0.38);
  const bladeMaterial = new MeshStandardMaterial({ color: "#2a2e35", roughness: 0.45, metalness: 0.1, transparent: true });
  for (let i = 0; i < 9; i++) {
    const mesh = new Mesh(bladeGeometry, bladeMaterial);
    mesh.rotation.y = (i * Math.PI * 2) / 9;
    mesh.castShadow = true;
    rotor.add(mesh);
  }
  const hubMesh = new Mesh(new CylinderGeometry(hub, hub, radius * 0.12, 32), plastic("#16181c", 0.4));
  hubMesh.position.y = radius * 0.03;
  rotor.add(hubMesh);
  const cap = new Mesh(new CircleGeometry(hub * 0.55, 32), glow("#3b7bff", 0.9));
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = radius * 0.09 + 0.001;
  rotor.add(cap);
  group.add(rotor);

  // When it spins fast the blades become a soft disc, like on a photo.
  const blur = new Mesh(new CircleGeometry(radius * 0.97, 48), new MeshBasicMaterial({ color: "#2a2e35", transparent: true, opacity: 0 }));
  blur.rotation.x = -Math.PI / 2;
  blur.position.y = 0.07;
  group.add(blur);

  let speed = 0.6;
  const animate = (time: number, delta: number, state: ModelState) => {
    const target = state.active ? 9 : 0.6;
    speed += (target - speed) * Math.min(1, delta * 1.5);
    rotor.rotation.y -= speed * delta;
    const fast = Math.min(1, Math.max(0, (speed - 2) / 6));
    bladeMaterial.opacity = 1 - fast * 0.55;
    (blur.material as MeshBasicMaterial).opacity = fast * 0.55;
    if (ringColor) (ringMaterial as MeshStandardMaterial).emissive = hueCycle(time, radius);
  };
  return { group, animate };
}

// ── Processor ───────────────────────────────────────────────────────────────

export function cpuBrand(name: string): { brand: string; model: string } {
  const apple = name.match(/apple\s+(m\d+(?:\s+(?:pro|max|ultra))?)/i);
  if (apple) return { brand: "APPLE", model: apple[1].toUpperCase() };
  const ryzen = name.match(/ryzen\s+(\d)\s+(?:pro\s+)?(\w+)/i);
  if (ryzen) return { brand: "RYZEN", model: `${ryzen[1]} ${ryzen[2].toUpperCase()}` };
  const ultra = name.match(/core\s+ultra\s+(\d)\s+(\w+)/i);
  if (ultra) return { brand: "intel", model: `CORE ULTRA ${ultra[1]} ${ultra[2].toUpperCase()}` };
  const core = name.match(/(i[3579])[- ](\w+)/i);
  if (core) return { brand: "intel", model: `CORE ${core[1].toLowerCase()}-${core[2].toUpperCase()}` };
  if (/intel/i.test(name)) return { brand: "intel", model: "" };
  if (/amd/i.test(name)) return { brand: "AMD", model: "" };
  return { brand: name.split(/\s+/)[0]?.toUpperCase() ?? "", model: "" };
}

function appleChip(model: string): Model {
  const group = new Group();
  group.add(at(box(4.6, 0.14, 3.8, pcb("#2b5a40"), 0.08), 0, 0.07, 0));
  const pads = gold();
  const padPositions: [number, number, number][] = [];
  for (let i = 0; i < 18; i++) padPositions.push([-2.1 + i * 0.25, 0.145, -1.75], [-2.1 + i * 0.25, 0.145, 1.75]);
  group.add(instanced(new BoxGeometry(0.1, 0.01, 0.08), pads, padPositions));
  const dieMaterial = chip();
  group.add(at(box(2.4, 0.12, 3.0, dieMaterial, 0.05), -0.75, 0.2, 0));
  for (const z of [-0.78, 0.78]) group.add(at(box(1.15, 0.1, 1.4, plastic("#16181c", 0.35), 0.04), 1.35, 0.19, z));
  const label = topLabel(labelTexture([{ text: model || "M", size: 120, weight: 800, color: "rgba(205,210,218,0.92)" }], 512, 512), 2.0, 2.0, { metalness: 0.4, roughness: 0.3 });
  group.add(at(label, -0.75, 0.262, 0));
  return {
    group,
    animate: (time, _delta, state) => {
      dieMaterial.emissive.set("#ff6a2a");
      dieMaterial.emissiveIntensity = state.active ? state.heat * 0.12 * (0.7 + 0.3 * Math.sin(time * 3)) : 0;
    },
  };
}

function processor(part: DetectedPart): Model {
  const { brand, model } = cpuBrand(part.name);
  if (brand === "APPLE") return appleChip(model);
  const group = new Group();
  group.add(at(box(4, 0.16, 4, pcb("#1f6d40"), 0.06), 0, 0.08, 0));
  const caps = metal("#b98d45", 0.35);
  for (const x of [-1.45, -1.15, -0.85, 0.85, 1.15, 1.45]) for (const z of [-1.86, 1.86]) group.add(at(box(0.2, 0.09, 0.11, caps), x, 0.2, z));
  const lidMaterial = metal("#cfd3d9", 0.3);
  let top: number;
  if (brand === "intel") {
    const s = new Shape();
    s.moveTo(-1.5, -1.75);
    for (const [x, y] of [[1.5, -1.75], [1.5, -1.4], [1.75, -1.4], [1.75, 1.4], [1.5, 1.4], [1.5, 1.75], [-1.5, 1.75], [-1.5, 1.4], [-1.75, 1.4], [-1.75, -1.4], [-1.5, -1.4]]) s.lineTo(x, y);
    s.closePath();
    const geometry = new ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
    geometry.rotateX(-Math.PI / 2);
    const lid = new Mesh(geometry, lidMaterial);
    lid.castShadow = true;
    lid.position.y = 0.19;
    group.add(lid);
    top = 0.19 + 0.25;
  } else {
    group.add(at(box(3.3, 0.24, 3.3, lidMaterial, 0.1), 0, 0.28, 0));
    top = 0.4;
  }
  const lines = [{ text: brand, size: brand === "intel" ? 92 : 78, weight: 800, color: "rgba(72,78,88,0.85)", spacing: brand === "intel" ? 0 : 6 }];
  if (model) lines.push({ text: model, size: 40, weight: 700, color: "rgba(80,86,96,0.8)", spacing: 2 });
  group.add(at(topLabel(labelTexture(lines), 2.9, 1.45, { metalness: 0.6, roughness: 0.35 }), 0, top + 0.002, 0));
  const triangle = new Shape();
  triangle.moveTo(0, 0);
  triangle.lineTo(0.35, 0);
  triangle.lineTo(0, 0.35);
  triangle.closePath();
  const marker = new Mesh(new ShapeGeometry(triangle), gold());
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(-1.9, 0.162, 1.9);
  group.add(marker);
  return {
    group,
    animate: (time, _delta, state) => {
      lidMaterial.emissive.set("#ff5a1f");
      lidMaterial.emissiveIntensity = state.active ? state.heat * 0.16 * (0.7 + 0.3 * Math.sin(time * 3)) : 0;
    },
  };
}

// ── Graphics card ───────────────────────────────────────────────────────────

export function graphicsCard(part: DetectedPart): Model {
  const integrated = !/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|rx \d|arc a|arc b/i.test(part.name);
  if (integrated) {
    // Graphics inside the processor: show the chip it lives in.
    return /apple/i.test(part.name) ? appleChip(cpuBrand(part.name).model) : processor({ ...part, name: part.name.replace(/graphics|uhd|iris|xe|radeon/gi, "").trim() || part.name });
  }
  const group = new Group();
  const L = 10.5;
  const W = 4.3;
  const H = 1.0;
  group.add(at(box(L, 0.08, W, metal("#3b4048", 0.42), 0.04), 0, 0.12, 0));
  group.add(at(box(L - 0.3, 0.1, W - 0.3, pcb("#14361f")), 0, 0.22, 0));
  // PCI Express contacts on the long edge
  group.add(at(box(4.4, 0.08, 0.5, pcb("#14361f")), 1.2, 0.22, W / 2 + 0.2));
  const pins: [number, number, number][] = [];
  for (let i = 0; i < 30; i++) pins.push([-0.9 + i * 0.14 + (i > 6 ? 0.12 : 0), 0.27, W / 2 + 0.25]);
  group.add(instanced(new BoxGeometry(0.08, 0.012, 0.36), gold(), pins));
  // Bracket
  const bracket = metal("#c9ced5", 0.35);
  group.add(at(box(0.07, 1.8, W + 0.3, bracket), -L / 2 - 0.05, 0.85, 0));
  for (let i = 0; i < 5; i++) group.add(at(box(0.02, 0.9, 0.22, plastic("#0d0f12")), -L / 2 - 0.09, 1.0, -1.4 + i * 0.6));
  // Shroud with accents
  const shroud = gunmetal("#2a2e35");
  group.add(at(box(L, H, W, shroud, 0.2), 0, 0.3 + H / 2, 0));
  const accent = gunmetal("#4b525c");
  group.add(at(box(L * 0.92, 0.04, 0.3, accent), 0, 0.3 + H + 0.01, W / 2 - 0.35));
  group.add(at(box(L * 0.92, 0.04, 0.3, accent), 0, 0.3 + H + 0.01, -W / 2 + 0.35));
  const rgbMaterial = glow("#3b7bff", 2.2);
  group.add(at(box(L * 0.62, 0.1, 0.03, rgbMaterial), 0.6, 0.3 + H * 0.55, W / 2 + 0.01));
  const brand = /nvidia|geforce|rtx|gtx/i.test(part.name) ? "GEFORCE RTX" : /radeon/i.test(part.name) ? "RADEON" : "ARC";
  const side = new Mesh(
    new PlaneGeometry(3.4, 0.6),
    new MeshStandardMaterial({ map: labelTexture([{ text: brand, size: 110, weight: 800, color: "#e9ecf1", spacing: 8 }], 1024, 180), transparent: true, roughness: 0.4 }),
  );
  side.position.set(-2.6, 0.3 + H * 0.55, W / 2 + 0.012);
  group.add(side);
  const fans = [-2.55, 2.55].map((x) => {
    const f = fan(1.75);
    f.group.position.set(x, 0.3 + H + 0.001, 0);
    group.add(f.group);
    return f;
  });
  return {
    group,
    animate: (time, delta, state) => {
      fans.forEach((f) => f.animate(time, delta, state));
      rgbMaterial.emissive = hueCycle(time);
    },
  };
}

// ── Memory ──────────────────────────────────────────────────────────────────

function memory(part: DetectedPart): Model {
  const ddr = String(part.specs.ddr ?? part.name);
  const group = new Group();
  if (/lpddr/i.test(ddr)) {
    group.add(at(box(5.2, 0.12, 3.6, pcb("#2a6345"), 0.06), 0, 0.06, 0));
    for (const [x, z] of [[-1.3, -0.85], [1.3, -0.85], [-1.3, 0.85], [1.3, 0.85]]) {
      group.add(at(box(2.2, 0.14, 1.4, chip(), 0.04), x, 0.19, z));
      group.add(at(topLabel(labelTexture([{ text: "LPDDR", size: 70, color: "rgba(150,156,166,0.9)", font: MONO }], 512, 160), 1.6, 0.5), x, 0.262, z));
    }
    return { group, view: { elevation: 40 } };
  }
  const L = 13.3;
  group.add(at(box(L, 2.95, 0.12, pcb("#1b2a20")), 0, 1.5, 0));
  const pins: [number, number, number][] = [];
  for (let i = 0; i < 70; i++) {
    const x = -L / 2 + 0.35 + i * 0.18 + (i >= 40 ? 0.3 : 0);
    if (x > L / 2 - 0.3) break;
    pins.push([x, 0.18, 0.065], [x, 0.18, -0.065]);
  }
  group.add(instanced(new BoxGeometry(0.11, 0.3, 0.01), gold(), pins));
  const spreader = gunmetal("#2c3138");
  for (const z of [-0.14, 0.14]) group.add(at(box(L - 0.2, 2.5, 0.12, spreader, 0.05), 0, 1.75, z));
  group.add(at(box(L - 0.2, 0.28, 0.42, gunmetal("#3a4048"), 0.08), 0, 3.12, 0));
  const capacity = part.specs.capacityGb ? `${part.specs.capacityGb} GB` : "";
  const label = new Mesh(
    new PlaneGeometry(6, 1.1),
    new MeshStandardMaterial({
      map: labelTexture(
        [
          { text: (part.name.split(/\s+/)[0] || "DDR").toUpperCase().slice(0, 14), size: 64, weight: 800, color: "#eef1f5", spacing: 4 },
          { text: `${ddr.toUpperCase()} · ${capacity}`, size: 40, weight: 700, color: "#9aa3b0", font: MONO },
        ],
        1024,
        200,
      ),
      transparent: true,
      roughness: 0.5,
    }),
  );
  label.position.set(-2.4, 1.85, 0.205);
  group.add(label);
  const rgb = /rgb|trident|dominator|xpg|delta|fury beast|vengeance/i.test(part.name);
  const bar = glow("#ff3df0", 2);
  if (rgb) group.add(at(box(L - 0.6, 0.22, 0.3, bar, 0.08), 0, 3.38, 0));
  return { group, view: { elevation: 26, azimuth: 28 }, animate: rgb ? (time) => (bar.emissive = hueCycle(time)) : undefined };
}

// ── Storage ─────────────────────────────────────────────────────────────────

const driveBrand = (name: string) => (name.match(/^(samsung|wd|western digital|kingston|crucial|sk hynix|apple|intel|seagate|toshiba|micron|adata|lexar|sabrent|corsair|sandisk|hp|lenovo)/i)?.[0] ?? "").toUpperCase();
const capacityText = (gb: unknown) => {
  const n = Number(gb);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n >= 1000 ? `${Math.round(n / 100) / 10} TB` : `${Math.round(n)} GB`;
};

function storage(part: DetectedPart): Model {
  const kind = String(part.specs.kind ?? "");
  const brand = driveBrand(part.name) || (kind === "HDD" ? "HDD" : "SSD");
  const capacity = capacityText(part.specs.capacityGb);
  const group = new Group();
  if (kind === "HDD") {
    group.add(at(box(10.2, 2.6, 14.6, aluminium("#bfc4ca"), 0.15), 0, 1.3, 0));
    const sticker = canvasTexture(512, 720, (ctx, w, h) => {
      ctx.fillStyle = "#f4f5f7";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1a1d22";
      ctx.font = `800 64px ${FONT}`;
      ctx.fillText(brand, 40, 110);
      ctx.font = `700 48px ${FONT}`;
      ctx.fillText(capacity, 40, 180);
      for (let i = 0; i < 60; i++) ctx.fillRect(40 + i * 7, 560, i % 3 ? 3 : 5, 90);
    });
    group.add(at(topLabel(sticker, 6.2, 8.6), 0, 2.602, -1.5));
    for (const [x, z] of [[-4.6, -6.8], [4.6, -6.8], [-4.6, 6.8], [4.6, 6.8]]) group.add(at(new Mesh(new CylinderGeometry(0.22, 0.22, 0.05, 16), metal("#8d949e")), x, 2.62, z));
    return { group, view: { elevation: 42 } };
  }
  if (kind === "UFS") {
    // Phone storage: one flash chip soldered on the board.
    group.add(at(box(4.4, 0.1, 3.2, pcb("#25543b"), 0.05), 0, 0.05, 0));
    group.add(at(box(2.6, 0.18, 2.0, chip(), 0.05), -0.3, 0.19, 0));
    group.add(at(topLabel(labelTexture([{ text: "UFS", size: 120, weight: 800, color: "rgba(200,205,212,0.9)" }, { text: capacity, size: 60, color: "rgba(150,156,166,0.9)", font: MONO }], 512, 400), 2.0, 1.55), -0.3, 0.282, 0));
    for (const z of [-1.0, 1.0]) group.add(at(box(0.5, 0.08, 0.3, metal("#b98d45", 0.35)), 1.6, 0.14, z));
    return { group, view: { elevation: 42 } };
  }
  if (kind === "SATA SSD") {
    group.add(at(box(7, 0.7, 10, gunmetal("#30343b"), 0.2), 0, 0.35, 0));
    group.add(at(topLabel(labelTexture([{ text: brand, size: 110, weight: 800, color: "#e9ecf1" }, { text: `SSD · ${capacity}`, size: 54, color: "#9aa3b0", font: MONO }], 512, 400), 5.6, 4.4), 0, 0.702, 0));
    return { group, view: { elevation: 45 } };
  }
  const outline = new Shape();
  outline.moveTo(-4, -1.1);
  outline.lineTo(3.7, -1.1);
  outline.absarc(3.7, -0.75, 0.35, -Math.PI / 2, 0, false);
  outline.lineTo(4.05, -0.25);
  outline.absarc(4.05, 0, 0.25, -Math.PI / 2, Math.PI / 2, true);
  outline.lineTo(4.05, 0.75);
  outline.absarc(3.7, 0.75, 0.35, 0, Math.PI / 2, false);
  outline.lineTo(-4, 1.1);
  outline.closePath();
  const board = new ExtrudeGeometry(outline, { depth: 0.08, bevelEnabled: false });
  board.rotateX(-Math.PI / 2);
  const boardMesh = new Mesh(board, pcb("#111a15"));
  boardMesh.castShadow = true;
  group.add(boardMesh);
  group.add(at(box(1.25, 0.1, 1.25, metal("#aab1ba", 0.3), 0.03), -2.55, 0.13, 0));
  group.add(at(box(1.9, 0.1, 1.5, chip(), 0.03), -0.2, 0.13, 0));
  group.add(at(box(1.9, 0.1, 1.5, chip(), 0.03), 1.95, 0.13, 0));
  const sticker = labelTexture(
    [
      { text: brand === "SSD" ? "NVMe" : brand, size: 88, weight: 800, color: "#eef1f5", spacing: 3 },
      { text: `${capacity} · NVMe M.2`, size: 40, color: "#8f98a5", font: MONO },
    ],
    1024,
    280,
  );
  const label = new Mesh(new PlaneGeometry(5.4, 1.75), new MeshStandardMaterial({ color: "#1c2026", roughness: 0.55 }));
  label.rotation.x = -Math.PI / 2;
  label.position.set(0.85, 0.185, 0);
  group.add(label);
  group.add(at(topLabel(sticker, 5.0, 1.37), 0.85, 0.187, 0));
  const pins: [number, number, number][] = [];
  for (let i = 0; i < 14; i++) {
    const z = -0.95 + i * 0.14 + (i >= 9 ? 0.12 : 0);
    if (z < 0.98) pins.push([-3.8, 0.085, z]);
  }
  group.add(instanced(new BoxGeometry(0.4, 0.01, 0.07), gold(), pins));
  return { group, view: { elevation: 38, azimuth: 24 } };
}

// ── Motherboard, battery ────────────────────────────────────────────────────

function motherboard(): Model {
  const group = new Group();
  group.add(at(box(12, 0.12, 12, pcb("#1a1e24")), 0, 0.06, 0));
  group.add(at(box(3, 0.22, 3, metal("#c9ced5", 0.32)), -1.6, 0.23, -1.4));
  group.add(at(box(2.2, 0.06, 2.2, plastic("#2a2e34")), -1.6, 0.35, -1.4));
  for (let i = 0; i < 4; i++) group.add(at(box(0.32, 0.4, 7, plastic(i % 2 ? "#3a4048" : "#525963", 0.4)), 2.2 + i * 0.6, 0.32, -1.6));
  for (const z of [2.6, 4.6]) {
    group.add(at(box(8.6, 0.38, 0.36, plastic("#4a515b", 0.4)), -1.2, 0.31, z));
    group.add(at(box(8.6, 0.06, 0.4, metal("#aab1ba", 0.3)), -1.2, 0.52, z));
  }
  const sink = gunmetal("#3a4048");
  group.add(at(box(5.4, 0.9, 1.1, sink, 0.08), -1.4, 0.57, -4.6));
  group.add(at(box(1.1, 0.9, 5, sink, 0.08), -4.9, 0.57, -2.2));
  for (let i = 0; i < 9; i++) group.add(at(box(0.08, 0.3, 1.1, sink), -3.8 + i * 0.6, 1.15, -4.6));
  group.add(at(box(2.6, 0.45, 2.6, gunmetal("#2c3138"), 0.12), 3.2, 0.34, 3.6));
  group.add(at(box(1.3, 1.4, 4.4, gunmetal("#2a2e34"), 0.1), -5.3, 0.82, -2.4));
  group.add(at(box(6, 0.22, 1.3, gunmetal("#454c56"), 0.06), -1.2, 0.23, 0.9));
  return { group, view: { elevation: 50 } };
}

function battery(part: DetectedPart): Model {
  const group = new Group();
  const health = Math.max(0, Math.min(100, Number(part.specs.healthPct) || 0));
  group.add(at(box(12, 0.75, 5.2, plastic("#22252a", 0.5), 0.2), 0, 0.375, 0));
  for (const x of [-3.9, 0, 3.9]) {
    const cell = new Mesh(new CylinderGeometry(0.42, 0.42, 3.4, 24), plastic("#2b3036", 0.35));
    cell.rotation.x = Math.PI / 2;
    cell.position.set(x, 0.7, 0);
    group.add(cell);
  }
  const color = health >= 80 ? "#2bd17e" : health >= 60 ? "#f0b45c" : "#ff6b5e";
  const level = glow(color, 1.8);
  group.add(at(box(10 * (health / 100), 0.06, 0.35, level, 0.03), -5 + 5 * (health / 100), 0.79, 2.15));
  group.add(at(topLabel(labelTexture([{ text: `${Math.round(health)}%`, size: 130, weight: 800, color: "#eef1f5" }, { text: "Li-ion", size: 44, color: "#9aa3b0", font: MONO }]), 4, 2), 0, 1.13, -0.6));
  return { group, view: { elevation: 40 } };
}

// ── Phone ───────────────────────────────────────────────────────────────────

function roundedPlane(w: number, h: number, r: number) {
  const s = new Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geometry = new ShapeGeometry(s, 12);
  const uv = geometry.attributes.uv;
  const pos = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return geometry;
}

function phoneScreen() {
  return canvasTexture(560, 1200, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#0f2a4a");
    g.addColorStop(0.55, "#2a64c9");
    g.addColorStop(1, "#7fd6c2");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `700 150px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("12:00", w / 2, 330);
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText("OLTechX Check", w / 2, 390);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = `hsla(${(row * 4 + col) * 40}, 70%, 60%, 0.95)`;
        ctx.beginPath();
        ctx.roundRect(70 + col * 115, 860 + row * 130, 80, 80, 22);
        ctx.fill();
      }
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(w / 2, 50, 16, 0, Math.PI * 2);
    ctx.fill();
  });
}

function phone(): Model {
  const group = new Group();
  const frame = new MeshPhysicalMaterial({ color: "#3a4049", metalness: 0.9, roughness: 0.28 });
  const body = box(7.2, 15.6, 0.82, frame, 0.95);
  body.position.y = 7.8;
  group.add(body);
  const screenGlass = new Mesh(roundedPlane(7.0, 15.4, 0.85), new MeshPhysicalMaterial({ color: "#050608", roughness: 0.08, clearcoat: 1 }));
  screenGlass.position.set(0, 7.8, 0.415);
  group.add(screenGlass);
  const screen = new Mesh(roundedPlane(6.7, 15.1, 0.7), new MeshBasicMaterial({ map: phoneScreen() }));
  screen.position.set(0, 7.8, 0.418);
  group.add(screen);
  const bump = box(2.7, 2.7, 0.25, new MeshPhysicalMaterial({ color: "#2a2f37", roughness: 0.3, clearcoat: 1 }), 0.5);
  bump.position.set(-1.9, 13.3, -0.5);
  group.add(bump);
  for (const [x, y] of [[-2.45, 13.85], [-1.35, 13.85], [-2.45, 12.75]]) {
    const lens = new Mesh(new CylinderGeometry(0.42, 0.42, 0.18, 32), metal("#9aa1ab", 0.25));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, y, -0.68);
    group.add(lens);
    const eye = new Mesh(new CircleGeometry(0.3, 32), new MeshPhysicalMaterial({ color: "#05070a", roughness: 0.05, clearcoat: 1, side: DoubleSide }));
    eye.position.set(x, y, -0.775);
    eye.rotation.y = Math.PI;
    group.add(eye);
  }
  for (const [y, h] of [[11.2, 1.6], [9.0, 2.4]]) group.add(at(box(0.12, h, 0.32, frame, 0.05), 3.64, y, 0));
  return { group, view: { azimuth: 22, elevation: 8, fill: 0.92 } };
}

// ── Laptops and Macs ────────────────────────────────────────────────────────

function keyboardTexture(dark: boolean, rgb: boolean, w: number, d: number) {
  return canvasTexture(1400, Math.round((1400 * d) / w), (ctx, cw, ch) => {
    const keyArea = { x: cw * 0.09, y: ch * 0.07, w: cw * 0.82, h: ch * 0.5 };
    ctx.fillStyle = dark ? "rgba(10,11,13,0.9)" : "rgba(40,42,46,0.25)";
    ctx.beginPath();
    ctx.roundRect(keyArea.x - 10, keyArea.y - 10, keyArea.w + 20, keyArea.h + 20, 18);
    ctx.fill();
    const rows = 6;
    const gap = 8;
    const keyH = (keyArea.h - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) {
      const count = r === 5 ? 9 : 14;
      const keyW = (keyArea.w - gap * (count - 1)) / count;
      for (let c = 0; c < count; c++) {
        const wide = r === 5 && c === 4;
        const x = keyArea.x + c * (keyW + gap) - (r === 5 && c > 4 ? -keyW * 0 : 0);
        ctx.fillStyle = dark ? "#16181c" : "#1c1d20";
        if (rgb) {
          ctx.shadowColor = `hsl(${(c / count) * 300}, 90%, 60%)`;
          ctx.shadowBlur = 14;
        }
        ctx.beginPath();
        ctx.roundRect(x, keyArea.y + r * (keyH + gap), wide ? keyW : keyW, r === 0 ? keyH * 0.7 : keyH, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    // Trackpad
    ctx.fillStyle = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    ctx.beginPath();
    ctx.roundRect(cw * 0.32, ch * 0.62, cw * 0.36, ch * 0.32, 20);
    ctx.fill();
  });
}

function laptop(options: { mac: boolean; thin: boolean; dark: boolean; rgb: boolean; screen: "mac" | "windows" }): Model {
  const group = new Group();
  const W = 30.4;
  const D = 21.2;
  const baseH = options.thin ? 0.85 : options.mac ? 1.25 : 2.0;
  const shell = options.dark ? gunmetal(options.mac ? "#3a3f48" : "#26292f") : aluminium(options.mac ? "#d3d5d8" : "#c5c8cc");
  group.add(at(box(W, baseH, D, shell, 0.5), 0, baseH / 2, 0));
  const deck = new Mesh(new PlaneGeometry(W - 0.8, D - 0.8), new MeshStandardMaterial({ map: keyboardTexture(options.dark, options.rgb, W, D), transparent: true, roughness: 0.6 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = baseH + 0.003;
  group.add(deck);
  if (!options.mac) group.add(at(box(W * 0.6, 0.5, 0.2, plastic("#0c0d10")), 0, baseH * 0.5, -D / 2 - 0.02));

  const lid = new Group();
  lid.position.set(0, baseH, -D / 2 + 0.2);
  const lidT = options.thin ? 0.42 : 0.55;
  lid.add(at(box(W, lidT, D - 0.4, shell, 0.4), 0, lidT / 2, (D - 0.4) / 2));
  const bezel = new Mesh(new PlaneGeometry(W - 0.5, D - 0.9), new MeshPhysicalMaterial({ color: "#050607", roughness: 0.1, clearcoat: 1 }));
  bezel.rotation.x = Math.PI / 2;
  bezel.position.set(0, -0.003, (D - 0.4) / 2);
  lid.add(bezel);
  const screen = new Mesh(new PlaneGeometry(W - 1.6, D - 2.2), new MeshBasicMaterial({ map: screenTexture(options.screen) }));
  screen.rotation.x = Math.PI / 2;
  screen.position.set(0, -0.006, (D - 0.4) / 2 + 0.2);
  lid.add(screen);
  lid.rotation.x = -(Math.PI * 108) / 180;
  group.add(lid);
  const hinge = new Mesh(new CylinderGeometry(0.45, 0.45, W * 0.86, 24), options.mac ? shell : plastic("#121418", 0.4));
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, baseH, -D / 2 + 0.25);
  group.add(hinge);
  return { group, view: { azimuth: 26, elevation: 22, fill: 0.9 } };
}

function imac(): Model {
  const group = new Group();
  const color = aluminium("#9dbbd9");
  const W = 27;
  const H = 19.5;
  const stand = new Group();
  stand.add(at(box(9, 0.45, 7.5, color, 0.3), 0, 0.22, 0.6));
  const neck = box(8.5, 11, 0.5, color, 0.2);
  neck.position.set(0, 5.6, -1.2);
  neck.rotation.x = -0.18;
  stand.add(neck);
  group.add(stand);
  const display = new Group();
  display.position.set(0, 13.5, 0);
  display.add(box(W, H, 0.6, color, 0.35));
  const front = new Mesh(new PlaneGeometry(W - 0.2, H - 0.2), new MeshPhysicalMaterial({ color: "#f3f4f6", roughness: 0.15, clearcoat: 1 }));
  front.position.z = 0.302;
  display.add(front);
  const screen = new Mesh(new PlaneGeometry(W - 1.4, H - 4.2), new MeshBasicMaterial({ map: screenTexture("mac") }));
  screen.position.set(0, 1.4, 0.305);
  display.add(screen);
  group.add(display);
  return { group, view: { azimuth: 20, elevation: 10, fill: 0.9 } };
}

function macMini(): Model {
  const group = new Group();
  group.add(at(box(12.7, 5, 12.7, aluminium("#d3d5d8"), 1.3), 0, 2.6, 0));
  group.add(at(new Mesh(new CylinderGeometry(4.6, 4.6, 0.14, 48), plastic("#141518", 0.7)), 0, 0.07, 0));
  for (const x of [-4.6, -3.6]) group.add(at(box(0.55, 0.22, 0.05, plastic("#0b0c0e")), x, 2.4, 6.36));
  group.add(at(new Mesh(new CircleGeometry(0.09, 16), glow("#ffffff", 3)), 5.2, 2.4, 6.36));
  return { group, view: { azimuth: 30, elevation: 28 } };
}

// ── Desktop tower ───────────────────────────────────────────────────────────

function tower(hardware: Hardware): Model {
  const group = new Group();
  const W = 10;
  const H = 22;
  const D = 21;
  const steel = gunmetal("#1b1e23");
  group.add(at(box(W, 0.4, D, steel, 0.15), 0, 0.2, 0));
  group.add(at(box(W, 0.4, D, steel, 0.15), 0, H - 0.2, 0));
  group.add(at(box(0.3, H, D, steel), W / 2 - 0.15, H / 2, 0));
  group.add(at(box(W, H, 0.3, steel), 0, H / 2, -D / 2 + 0.15));
  for (const z of [D / 2 - 0.3, -D / 2 + 0.4]) group.add(at(box(0.4, H, 0.4, steel), -W / 2 + 0.2, H / 2, z));
  group.add(at(box(W, 0.6, 0.4, steel), 0, H - 0.5, D / 2 - 0.2));
  // Glass side and glass front
  const sideGlass = box(0.12, H - 0.8, D - 0.8, glass());
  sideGlass.castShadow = false;
  group.add(at(sideGlass, -W / 2 + 0.1, H / 2, 0));
  const frontGlass = box(W - 0.8, H - 0.8, 0.12, glass());
  frontGlass.castShadow = false;
  group.add(at(frontGlass, 0, H / 2, D / 2 - 0.1));
  // Power supply cover and motherboard
  group.add(at(box(W - 0.6, 4.2, D - 0.8, gunmetal("#22262c")), 0, 2.5, 0));
  group.add(at(box(0.12, 13, 11, pcb("#15191e")), W / 2 - 0.45, 12.5, -2.5));

  const animated: ((time: number, delta: number, state: ModelState) => void)[] = [];
  // Processor cooler: a tower of fins with a fan in front.
  const fins = new Group();
  for (let i = 0; i < 18; i++) fins.add(at(box(2.6, 4.6, 0.06, metal("#c9ced5", 0.3)), 0, 0, -1.1 + i * 0.13));
  fins.position.set(W / 2 - 2.1, 15.5, -3.5);
  group.add(fins);
  const coolerFan = fan(2.0, "#3b7bff");
  coolerFan.group.rotation.x = Math.PI / 2;
  coolerFan.group.position.set(W / 2 - 2.1, 15.5, -1.0);
  group.add(coolerFan.group);
  animated.push(coolerFan.animate);
  // Memory sticks with light bars
  const ramBars: MeshStandardMaterial[] = [];
  for (let i = 0; i < 2; i++) {
    group.add(at(box(1.5, 6.2, 0.22, gunmetal("#2c3138")), W / 2 - 1.3, 15, 0.9 + i * 0.55));
    const bar = glow("#ff3df0", 2.2);
    ramBars.push(bar);
    group.add(at(box(0.25, 6.0, 0.26, bar), W / 2 - 2.15, 15, 0.9 + i * 0.55));
  }
  // Graphics card on a vertical mount, fans towards the glass.
  const gpuPart = hardware.parts.find((p) => p.slot === "gpu") ?? { slot: "gpu" as const, name: "GeForce RTX", specs: {} };
  const card = graphicsCard(/nvidia|geforce|rtx|gtx|radeon|arc/i.test(gpuPart.name) ? gpuPart : { ...gpuPart, name: "GeForce RTX" });
  const inner = new Group();
  inner.add(card.group);
  inner.rotation.z = Math.PI / 2;
  const mount = new Group();
  mount.add(inner);
  mount.rotation.x = Math.PI / 2;
  mount.scale.setScalar(1.15);
  mount.position.set(-0.6, 8.6, 0.5);
  group.add(mount);
  if (card.animate) animated.push(card.animate);
  // Three fans behind the front glass, one at the back.
  for (const y of [8.5, 13.5, 18.5]) {
    const f = fan(2.2, "#3b7bff");
    f.group.rotation.x = Math.PI / 2;
    f.group.position.set(0, y, D / 2 - 0.9);
    group.add(f.group);
    animated.push(f.animate);
  }
  const rear = fan(2.0, "#3b7bff");
  rear.group.rotation.x = -Math.PI / 2;
  rear.group.position.set(-0.5, 17.5, -D / 2 + 0.6);
  group.add(rear.group);
  animated.push(rear.animate);
  const light = new PointLight("#6f8cff", 18, 30, 1.6);
  light.position.set(-1, 12, 2);
  group.add(light);
  return {
    group,
    view: { azimuth: -38, elevation: 16, fill: 0.88 },
    animate: (time, delta, state) => {
      animated.forEach((a) => a(time, delta, state));
      ramBars.forEach((bar, i) => (bar.emissive = hueCycle(time, i * 0.1)));
      light.color = hueCycle(time, 0.5);
    },
  };
}

// ── Choosing the model ──────────────────────────────────────────────────────

export function partModel(part: DetectedPart): Model {
  switch (part.slot) {
    case "cpu":
      return processor(part);
    case "gpu":
      return graphicsCard(part);
    case "ram":
      return memory(part);
    case "storage":
      return storage(part);
    case "motherboard":
      return motherboard();
    case "battery":
      return battery(part);
    default:
      return phone();
  }
}

/** The whole device: a MacBook, an iMac, a Mac mini, a laptop, a desktop with a glass side, or a phone. */
export function deviceModel(hardware: Hardware): Model {
  const name = hardware.computerName ?? "";
  if (hardware.device.kind === "phone") return phone();
  if (/imac/i.test(name)) return imac();
  if (/mac mini|mac studio/i.test(name)) return macMini();
  const mac = /mac/i.test(name) || /macos/i.test(hardware.device.platform ?? "");
  if (mac) return hardware.laptop || /macbook/i.test(name) ? laptop({ mac: true, thin: /air/i.test(name), dark: false, rgb: false, screen: "mac" }) : macMini();
  if (hardware.laptop) {
    const gaming = /rtx|gtx|radeon rx/i.test(hardware.parts.find((p) => p.slot === "gpu")?.name ?? "");
    return laptop({ mac: false, thin: false, dark: true, rgb: gaming, screen: "windows" });
  }
  return tower(hardware);
}
