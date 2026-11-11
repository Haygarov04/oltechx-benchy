import { useEffect, useRef, useState } from "react";

/**
 * A modern meter: a ring of thin segments that light up with the value, a soft glow, and a large
 * number that glides to each new reading. The scale follows the highest value seen in the stage.
 */
const SEGMENTS = 56;
const SWEEP = 260;
const CX = 120;
const CY = 120;

const at = (angle: number, radius: number) => {
  const a = (angle * Math.PI) / 180;
  return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)] as const;
};

/** Glides from the shown value to the new one instead of jumping. */
function useGlide(target: number) {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    let frame = 0;
    const step = () => {
      current.current += (target - current.current) * 0.18;
      if (Math.abs(target - current.current) < 0.002) current.current = target;
      setShown(current.current);
      if (current.current !== target) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

export function Gauge({ fraction, value, unit, label }: { fraction: number; value: string; unit: string; label: string }) {
  const level = useGlide(Math.max(0, Math.min(1, fraction)));
  const lit = Math.round(level * SEGMENTS);
  return (
    <svg className="gauge" viewBox="0 0 240 216" role="img" aria-label={`${label}: ${value} ${unit}`}>
      <defs>
        <filter id="gauge-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="gauge-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={CX} cy={CY} r="86" fill="url(#gauge-core)" />
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const angle = -SWEEP / 2 + (SWEEP / (SEGMENTS - 1)) * i;
        const on = i < lit;
        const [x1, y1] = at(angle, 92);
        const [x2, y2] = at(angle, on ? 110 : 104);
        // Blue through cyan to green as the value climbs.
        const hue = 222 - (i / SEGMENTS) * 70;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth="3.2"
            strokeLinecap="round"
            stroke={on ? `hsl(${hue} 92% 58%)` : "var(--border-strong)"}
            opacity={on ? 1 : 0.55}
            filter={on && i >= lit - 6 ? "url(#gauge-glow)" : undefined}
            style={{ transition: "stroke 0.2s" }}
          />
        );
      })}
      <text className="gauge-value" x={CX} y={CY + 14} textAnchor="middle">
        {value}
      </text>
      <text className="gauge-unit" x={CX} y={CY + 38} textAnchor="middle">
        {unit}
      </text>
      <text className="gauge-unit" x={CX} y={CY + 84} textAnchor="middle" style={{ opacity: 0.7 }}>
        {Math.round(level * 100)}%
      </text>
    </svg>
  );
}
