import { useId } from "react";

/**
 * Speed over time as a smooth glowing curve. A flat line means no slowdown from heat.
 * The newest point pulses; the faint line marks the highest value.
 */
export function Scope({ samples, slots = 30, live = false, label }: { samples: number[]; slots?: number; live?: boolean; label: string }) {
  const id = useId().replace(/:/g, "");
  const width = 320;
  const height = 96;
  const pad = 8;
  const max = Math.max(...samples, 1) * 1.15;
  // The floor sits well below the lowest value, so small changes do not look like big swings.
  const min = Math.min(...samples, max) * 0.55;
  const span = Math.max(max - min, 1e-9);
  const step = (width - pad * 2) / Math.max(slots - 1, samples.length - 1, 1);
  const points = samples.map((value, i) => [pad + i * step, height - pad - ((value - min) / span) * (height - pad * 2)] as const);
  // A smooth curve through the points (Catmull-Rom turned into Bézier pieces).
  let curve = points.length ? `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}` : "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    curve += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}, ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const last = points.at(-1);
  const peak = points.length ? Math.min(...points.map((p) => p[1])) : 0;
  return (
    <svg className="scope" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="#22c3a6" />
        </linearGradient>
        <filter id={`${id}g`} x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={pad + ((width - pad * 2) / 8) * i} x2={pad + ((width - pad * 2) / 8) * i} y1={pad} y2={height - pad} stroke="var(--border)" strokeDasharray="1 5" vectorEffect="non-scaling-stroke" />
      ))}
      {points.length > 1 && (
        <>
          <line x1={pad} x2={width - pad} y1={peak} y2={peak} stroke="var(--faint)" strokeDasharray="4 4" opacity="0.6" vectorEffect="non-scaling-stroke" />
          <path d={`${curve} L ${last![0].toFixed(1)} ${height - pad} L ${points[0][0].toFixed(1)} ${height - pad} Z`} fill={`url(#${id}a)`} />
          <path d={curve} fill="none" stroke={`url(#${id}l)`} strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" filter={`url(#${id}g)`} />
        </>
      )}
      {live && last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="7" className="scope-ring" style={{ fill: "none", stroke: "#22c3a6" }} />
          <circle cx={last[0]} cy={last[1]} r="3.2" style={{ fill: "#22c3a6" }} />
        </>
      )}
    </svg>
  );
}
