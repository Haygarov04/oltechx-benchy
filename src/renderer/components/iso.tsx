/**
 * Isometric building blocks for the hardware figures: boxes, plates, fans and parts that lift apart.
 * The same figures as on oltechx.com. A figure comes alive when its host has the class "iso-live" or is hovered.
 */
import type { CSSProperties, ReactNode } from "react";

const COS = 0.866;
const SIN = 0.5;

type Vec3 = [number, number, number];

const round = (n: number) => Math.round(n * 100) / 100;

export function project([x, y, z]: Vec3): [number, number] {
  return [round((x - y) * COS), round((x + y) * SIN - z)];
}

const pts = (...points: Vec3[]) => points.map((p) => project(p).join(",")).join(" ");

export type Tone = "base" | "dark" | "metal" | "accent" | "gold" | "glass" | "paper" | "shell";

export function Box({
  at: [x, y, z],
  size: [w, d, h],
  tone = "base",
}: {
  at: Vec3;
  size: Vec3;
  tone?: Tone;
}) {
  const x1 = x + w;
  const y1 = y + d;
  const z1 = z + h;
  return (
    <g className={`iso-${tone}`}>
      <polygon className="iso-t" points={pts([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1])} />
      <polygon className="iso-l" points={pts([x, y1, z1], [x1, y1, z1], [x1, y1, z], [x, y1, z])} />
      <polygon className="iso-r" points={pts([x1, y, z1], [x1, y1, z1], [x1, y1, z], [x1, y, z])} />
    </g>
  );
}

export function Quad({ points, className }: { points: [Vec3, Vec3, Vec3, Vec3]; className: string }) {
  return <polygon className={className} points={pts(...points)} />;
}

export function Move({
  by,
  delay = 0,
  children,
}: {
  by: Vec3;
  delay?: number;
  children: ReactNode;
}) {
  const [mx, my] = project(by);
  return (
    <g
      className="iso-move"
      style={
        {
          "--mx": `${mx}px`,
          "--my": `${my}px`,
          transitionDelay: `${delay}ms`,
        } as CSSProperties
      }
    >
      {children}
    </g>
  );
}

type Plane = "x" | "y" | "z";

function planeMatrix(center: Vec3, plane: Plane): string {
  const [e, f] = project(center);
  const axes: Record<Plane, [number, number, number, number]> = {
    x: [-COS, SIN, 0, -1],
    y: [COS, SIN, 0, -1],
    z: [COS, SIN, -COS, SIN],
  };
  const [a, b, c, d] = axes[plane];
  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
}

export function Fan({
  center,
  r,
  plane,
  blades = 7,
  reverse = false,
}: {
  center: Vec3;
  r: number;
  plane: Plane;
  blades?: number;
  reverse?: boolean;
}) {
  const blade = `M0 0 C${r * 0.28} ${-r * 0.2} ${r * 0.62} ${-r * 0.42} ${r * 0.9} ${-r * 0.2} C${r * 0.68} ${-r * 0.05} ${r * 0.36} ${r * 0.08} 0 0Z`;
  return (
    <g transform={planeMatrix(center, plane)}>
      <circle className="iso-fan-ring" r={r} />
      <g className={reverse ? "iso-spin iso-spin-reverse" : "iso-spin"}>
        {Array.from({ length: blades }, (_, i) => (
          <path key={i} className="iso-blade" d={blade} transform={`rotate(${(360 / blades) * i})`} />
        ))}
      </g>
      <circle className="iso-fan-hub" r={r * 0.2} />
    </g>
  );
}

export function Disc({
  center,
  r,
  plane,
  className = "iso-cone",
}: {
  center: Vec3;
  r: number;
  plane: Plane;
  className?: string;
}) {
  return (
    <g transform={planeMatrix(center, plane)}>
      <circle className="iso-fan-ring" r={r} />
      <g className={className}>
        <circle className="iso-cone-outer" r={r * 0.82} />
        <circle className="iso-cone-inner" r={r * 0.34} />
      </g>
    </g>
  );
}

export function Cylinder({
  at: [x, y, z],
  r,
  h,
  tone = "base",
}: {
  at: Vec3;
  r: number;
  h: number;
  tone?: Tone;
}) {
  const [cx, cy] = project([x, y, z + h]);
  const a = round(r * 1.2247);
  const b = round(r * 0.7071);
  return (
    <g className={`iso-${tone}`}>
      <path
        className="iso-l"
        d={`M${cx - a} ${cy}L${cx - a} ${cy + h}A${a} ${b} 0 0 0 ${cx + a} ${cy + h}L${cx + a} ${cy}Z`}
      />
      <ellipse className="iso-t" cx={cx} cy={cy} rx={a} ry={b} />
    </g>
  );
}

function roundedRectPath(w: number, d: number, r: number) {
  const x = w / 2;
  const y = d / 2;
  return `M${-x + r} ${-y}H${x - r}Q${x} ${-y} ${x} ${-y + r}V${y - r}Q${x} ${y} ${x - r} ${y}H${-x + r}Q${-x} ${y} ${-x} ${y - r}V${-y + r}Q${-x} ${-y} ${-x + r} ${-y}Z`;
}

export function Plate({
  center: [x, y, z],
  size: [w, d, h],
  r = 3,
  tone = "base",
}: {
  center: Vec3;
  size: Vec3;
  r?: number;
  tone?: Tone;
}) {
  const path = roundedRectPath(w, d, r);
  const steps = Math.max(1, Math.ceil(h));
  return (
    <g className={`iso-${tone}`}>
      {Array.from({ length: steps }, (_, i) => (
        <path
          key={i}
          d={path}
          className={i === 0 ? "iso-l" : "iso-l iso-side"}
          transform={planeMatrix([x, y, z + (h * i) / steps], "z")}
        />
      ))}
      <path d={path} className="iso-t" transform={planeMatrix([x, y, z + h], "z")} />
    </g>
  );
}

export function Extruded({
  path,
  center: [x, y, z],
  h,
  plane = "z",
  tone = "base",
}: {
  path: string;
  center: Vec3;
  h: number;
  plane?: Plane;
  tone?: Tone;
}) {
  const steps = Math.max(1, Math.ceil(h));
  const at = (t: number): Vec3 =>
    plane === "z" ? [x, y, z + t] : plane === "x" ? [x + t, y, z] : [x, y + t, z];
  return (
    <g className={`iso-${tone}`}>
      {Array.from({ length: steps }, (_, i) => (
        <path
          key={i}
          d={path}
          className={i === 0 ? "iso-l" : "iso-l iso-side"}
          transform={planeMatrix(at((h * i) / steps), plane)}
        />
      ))}
      <path d={path} className="iso-t" transform={planeMatrix(at(h), plane)} />
    </g>
  );
}

export function Surface({
  center,
  w,
  d,
  r = 1,
  plane = "z",
  className,
}: {
  center: Vec3;
  w: number;
  d: number;
  r?: number;
  plane?: Plane;
  className: string;
}) {
  return <path className={className} d={roundedRectPath(w, d, r)} transform={planeMatrix(center, plane)} />;
}

export function Grid({
  center,
  w,
  d,
  cols,
  rows,
  plane = "z",
  className = "iso-grid",
}: {
  center: Vec3;
  w: number;
  d: number;
  cols: number;
  rows: number;
  plane?: Plane;
  className?: string;
}) {
  let path = "";
  for (let i = 0; i <= cols; i++) path += `M${-w / 2 + (w * i) / cols} ${-d / 2}V${d / 2}`;
  for (let i = 0; i <= rows; i++) path += `M${-w / 2} ${-d / 2 + (d * i) / rows}H${w / 2}`;
  return <path className={className} d={path} transform={planeMatrix(center, plane)} />;
}

export function Knob({ center, r, plane = "y" }: { center: Vec3; r: number; plane?: Plane }) {
  return (
    <g transform={planeMatrix(center, plane)}>
      <circle className="iso-fan-ring" r={r} />
      <g className="iso-knob">
        <circle className="iso-fan-hub" r={r * 0.72} />
        <path className="iso-knob-mark" d={`M0 ${r * 0.7}V${r * 0.2}`} />
      </g>
    </g>
  );
}

export function Waves({ x, y, size = 10, count = 3 }: { x: number; y: number; size?: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const s = size + i * (size * 0.55);
        return (
          <path
            key={i}
            className="iso-wave"
            style={{ "--d": `${i * 180}ms` } as CSSProperties}
            d={`M${x - s} ${y}Q${x} ${y - s * 0.9} ${x + s} ${y}`}
            transform={`translate(0 ${-i * (size * 0.42)})`}
          />
        );
      })}
    </>
  );
}

export function Figure({
  children,
  view = "-62 -62 124 124",
  className,
}: {
  children: ReactNode;
  view?: string;
  className?: string;
}) {
  return (
    <svg viewBox={view} className={`iso-fig ${className ?? ""}`} aria-hidden="true">
      {children}
    </svg>
  );
}
