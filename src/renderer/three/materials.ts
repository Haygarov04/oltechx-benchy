import { CanvasTexture, Color, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

/**
 * Materials that react to light the way the real things do: brushed metal, aluminium, circuit board,
 * gold contacts, glossy chips and glass. The environment light makes the reflections.
 */

const textures = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let texture = textures.get(key);
  if (!texture) textures.set(key, (texture = make()));
  return texture;
}

/** Fine parallel scratches, like machined or brushed metal. Used for roughness and a slight relief. */
function brushedTexture() {
  return cached("brushed", () => {
    const texture = dataTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = "#c8c8c8";
      ctx.fillRect(0, 0, w, h);
      let x = 7;
      for (let i = 0; i < 2600; i++) {
        x = (x * 16807) % 2147483647;
        const y = x % h;
        const shade = 150 + ((x >> 8) % 105);
        ctx.fillStyle = `rgba(${shade},${shade},${shade},0.35)`;
        ctx.fillRect(0, y, w, 1 + ((x >> 4) % 2));
      }
    });
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  });
}

/** Grain for plastics and anodised surfaces. */
function grainTexture() {
  return cached("grain", () => {
    const texture = dataTexture(256, 256, (ctx, w, h) => {
      const image = ctx.createImageData(w, h);
      let x = 99;
      for (let i = 0; i < w * h; i++) {
        x = (x * 16807) % 2147483647;
        const v = 200 + (x % 55);
        image.data.set([v, v, v, 255], i * 4);
      }
      ctx.putImageData(image, 0, 0);
    });
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  });
}

/** A circuit board: copper traces under the solder mask, vias and small white markings. */
function boardTexture(color: string) {
  return cached(`board-${color}`, () =>
    canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      let x = 4242;
      const next = (n: number) => ((x = (x * 16807) % 2147483647) % n);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${0.05 + next(8) / 100})`;
        let px = next(w);
        let py = next(h);
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let s = 0; s < 4; s++) {
          const len = 20 + next(90);
          const dir = next(4);
          px += dir === 0 ? len : dir === 1 ? -len : dir === 2 ? len * 0.7 : 0;
          py += dir === 2 ? len * 0.7 : dir === 3 ? len : 0;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.fillStyle = "rgba(214,173,85,0.75)";
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 26; i++) ctx.fillRect(next(w), next(h), 6 + next(10), 2);
    }),
  );
}

export const metal = (color = "#cfd3d9", roughness = 0.3) =>
  new MeshStandardMaterial({ color, metalness: 1, roughness: roughness * 1.25, roughnessMap: brushedTexture(), bumpMap: brushedTexture(), bumpScale: 0.6 });
export const aluminium = (color = "#d4d6d9") =>
  new MeshStandardMaterial({ color, metalness: 0.95, roughness: 0.46, roughnessMap: grainTexture(), bumpMap: grainTexture(), bumpScale: 0.25 });
export const gunmetal = (color = "#2c3037") =>
  new MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.46, roughnessMap: grainTexture(), bumpMap: grainTexture(), bumpScale: 0.3 });
export const plastic = (color = "#1d2025", roughness = 0.55) => new MeshStandardMaterial({ color, metalness: 0.05, roughness, bumpMap: grainTexture(), bumpScale: 0.35 });
export const pcb = (color = "#1d6a3d") => new MeshPhysicalMaterial({ map: boardTexture(color), metalness: 0.15, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35 });
export const gold = () => new MeshStandardMaterial({ color: "#e2b65a", metalness: 1, roughness: 0.22 });
export const chip = () => new MeshPhysicalMaterial({ color: "#121316", metalness: 0.2, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.2 });
export const glass = () =>
  new MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.04, transmission: 0.92, thickness: 0.4, transparent: true, opacity: 0.35, ior: 1.5 });
export const glow = (color: string, intensity = 2) => new MeshStandardMaterial({ color: "#000000", emissive: new Color(color), emissiveIntensity: intensity, roughness: 0.4 });

/** A canvas texture that holds numbers (roughness, relief), not colours. */
function dataTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!, width, height);
  return new CanvasTexture(canvas);
}

/** Draws on a canvas and turns it into a texture: labels, keyboards, screens. */
export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export const FONT = '"Sofia Sans", system-ui, sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, monospace';

/** A printed or engraved label: text on a transparent background. */
export function labelTexture(lines: { text: string; size: number; weight?: number; color: string; font?: string; spacing?: number }[], width = 512, height = 256) {
  return canvasTexture(width, height, (ctx, w, h) => {
    const total = lines.reduce((s, l) => s + l.size * 1.15, 0);
    let y = (h - total) / 2;
    for (const line of lines) {
      ctx.font = `${line.weight ?? 700} ${line.size}px ${line.font ?? FONT}`;
      ctx.fillStyle = line.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      if (line.spacing) ctx.letterSpacing = `${line.spacing}px`;
      ctx.fillText(line.text, w / 2, y);
      y += line.size * 1.15;
    }
  });
}

/** A screen picture: soft gradient wallpaper, like a real display that is switched on. */
export function screenTexture(kind: "mac" | "windows" | "android", width = 1024, height = 640) {
  return canvasTexture(width, height, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    if (kind === "mac") {
      gradient.addColorStop(0, "#1b3d8f");
      gradient.addColorStop(0.5, "#5b4fd1");
      gradient.addColorStop(1, "#f08a5d");
    } else if (kind === "windows") {
      gradient.addColorStop(0, "#071a3a");
      gradient.addColorStop(0.55, "#0b5cd6");
      gradient.addColorStop(1, "#7cc4ff");
    } else {
      gradient.addColorStop(0, "#0f2027");
      gradient.addColorStop(0.5, "#1f6f8b");
      gradient.addColorStop(1, "#99e0c8");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    // Soft light shapes across the wallpaper.
    for (let i = 0; i < 5; i++) {
      const glowSpot = ctx.createRadialGradient(w * (0.15 + i * 0.2), h * (0.3 + (i % 2) * 0.4), 0, w * (0.15 + i * 0.2), h * (0.3 + (i % 2) * 0.4), w * 0.35);
      glowSpot.addColorStop(0, "rgba(255,255,255,0.16)");
      glowSpot.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glowSpot;
      ctx.fillRect(0, 0, w, h);
    }
    // A small window of the check app in the middle.
    const cw = w * 0.46;
    const ch = h * 0.42;
    const x = (w - cw) / 2;
    const y = (h - ch) / 2;
    ctx.fillStyle = "rgba(246,245,241,0.94)";
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, 14);
    ctx.fill();
    ctx.fillStyle = "#12161c";
    ctx.font = `800 ${Math.round(ch * 0.14)}px ${FONT}`;
    ctx.fillText("OLTechX", x + cw * 0.08, y + ch * 0.28);
    ctx.fillStyle = "#0a46c2";
    ctx.fillRect(x + cw * 0.08, y + ch * 0.62, cw * 0.84 * 0.7, ch * 0.07);
    ctx.fillStyle = "#e2e0d8";
    ctx.fillRect(x + cw * 0.08 + cw * 0.84 * 0.7, y + ch * 0.62, cw * 0.84 * 0.3, ch * 0.07);
    ctx.fillStyle = "#5f6672";
    ctx.font = `600 ${Math.round(ch * 0.08)}px ${FONT}`;
    ctx.fillText(kind === "android" ? "Check" : "Device check", x + cw * 0.08, y + ch * 0.48);
  });
}
