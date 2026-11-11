/**
 * A dial like on a test bench: 270 degrees, ticks, a glowing arc and a needle.
 * The scale grows with the highest value seen, so the needle always has room to move.
 */
const CX = 100;
const CY = 100;
const R = 78;
const SWEEP = 270;

const point = (angle: number, radius: number) => {
  const a = (angle * Math.PI) / 180;
  return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)] as const;
};

export function Gauge({ fraction, value, unit, label }: { fraction: number; value: string; unit: string; label: string }) {
  const f = Math.max(0, Math.min(1, fraction));
  const [sx, sy] = point(-135, R);
  const [ex, ey] = point(135, R);
  const arc = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R} ${R} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  const length = (R * SWEEP * Math.PI) / 180;
  const ticks = Array.from({ length: 28 }, (_, i) => {
    const angle = -135 + (SWEEP / 27) * i;
    const major = i % 3 === 0;
    const [x1, y1] = point(angle, R - 12);
    const [x2, y2] = point(angle, R - (major ? 22 : 17));
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--faint)" strokeWidth={major ? 2 : 1} strokeLinecap="round" opacity={major ? 0.9 : 0.55} />;
  });
  return (
    <svg className="gauge" viewBox="-4 -4 208 208" role="img" aria-label={`${label}: ${value} ${unit}`}>
      <defs>
        <linearGradient id="gauge-arc" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="#22c3a6" />
        </linearGradient>
        <radialGradient id="gauge-face" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="var(--surface)" />
          <stop offset="1" stopColor="var(--surface-3)" />
        </radialGradient>
        <linearGradient id="gauge-bezel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--border-strong)" />
          <stop offset="1" stopColor="var(--border)" />
        </linearGradient>
        <filter id="gauge-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx={CX} cy={CY} r={R + 14} fill="url(#gauge-face)" stroke="url(#gauge-bezel)" strokeWidth="3" />
      {ticks}
      <path d={arc} fill="none" stroke="var(--surface-3)" strokeWidth="9" strokeLinecap="round" />
      <path
        className="gauge-arc"
        d={arc}
        fill="none"
        stroke="url(#gauge-arc)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - f)}
        filter="url(#gauge-glow)"
      />
      <g className="gauge-needle" style={{ transform: `rotate(${-135 + SWEEP * f}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
        <path d={`M ${CX - 2.5} ${CY} L ${CX} ${CY - R + 26} L ${CX + 2.5} ${CY} Z`} fill="var(--danger)" />
      </g>
      <circle cx={CX} cy={CY} r="7" fill="var(--fg)" />
      <circle cx={CX} cy={CY} r="3" fill="var(--surface)" />
      <text className="gauge-value" x={CX} y={CY + 46} textAnchor="middle">
        {value}
      </text>
      <text className="gauge-unit" x={CX} y={CY + 62} textAnchor="middle">
        {unit}
      </text>
    </svg>
  );
}
