/** Graphics speed second by second. A flat line means it does not throttle from heat. */
export function Scope({ samples, slots = 30, live = false, label }: { samples: number[]; slots?: number; live?: boolean; label: string }) {
  const width = 300;
  const height = 90;
  const max = Math.max(...samples, 1) * 1.18;
  const step = width / Math.max(slots - 1, samples.length - 1, 1);
  const points = samples.map((value, i) => [i * step, height - (value / max) * height] as const);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = points.at(-1);
  return (
    <svg className="scope" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--primary)", stopOpacity: 0.22 }} />
          <stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {[1, 2, 3].map((i) => (
        <line key={i} x1="0" x2={width} y1={(height / 4) * i} y2={(height / 4) * i} style={{ stroke: "var(--border)" }} vectorEffect="non-scaling-stroke" />
      ))}
      {points.length > 1 && (
        <>
          <polygon points={`0,${height} ${line} ${points.at(-1)![0].toFixed(1)},${height}`} fill="url(#fill)" />
          <polyline points={line} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className="scope-line" style={{ stroke: "var(--primary)" }} />
        </>
      )}
      {live && last && <circle cx={last[0]} cy={last[1]} r="3.5" className="scope-dot" style={{ fill: "var(--primary)" }} />}
    </svg>
  );
}
