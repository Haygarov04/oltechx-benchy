import { CanvasTexture, Color, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace, type Texture } from "three";

/**
 * Materials that react to light the way the real things do: brushed metal, aluminium, circuit board,
 * gold contacts, glossy chips and glass. The environment light makes the reflections.
 */

export const metal = (color = "#cfd3d9", roughness = 0.3) => new MeshStandardMaterial({ color, metalness: 1, roughness });
export const aluminium = (color = "#d4d6d9") => new MeshStandardMaterial({ color, metalness: 0.95, roughness: 0.38 });
export const gunmetal = (color = "#2c3037") => new MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.38 });
export const plastic = (color = "#1d2025", roughness = 0.55) => new MeshStandardMaterial({ color, metalness: 0.05, roughness });
export const pcb = (color = "#1d6a3d") => new MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.55 });
export const gold = () => new MeshStandardMaterial({ color: "#e2b65a", metalness: 1, roughness: 0.22 });
export const chip = () => new MeshPhysicalMaterial({ color: "#121316", metalness: 0.2, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.2 });
export const glass = () =>
  new MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.04, transmission: 0.92, thickness: 0.4, transparent: true, opacity: 0.35, ior: 1.5 });
export const glow = (color: string, intensity = 2) => new MeshStandardMaterial({ color: "#000000", emissive: new Color(color), emissiveIntensity: intensity, roughness: 0.4 });

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
