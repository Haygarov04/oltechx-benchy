import type { DetectedPart, PartSlot } from "../../shared/types";
import board from "../assets/renders/board.webp";

/**
 * The motherboard from the oltechx.com home page with the parts of this device on it.
 * Each detected part lights up its place on the board: hover dims the rest, a click opens the part,
 * and during the check the part under test glows and pulses.
 */

type Ring = readonly [x: number, y: number, width: number, height: number];

const W = 1000;
const H = 960;

/** Where each kind of part sits on the board picture, and where its label goes. */
const PLACES: Partial<Record<PartSlot, { rings: Ring[]; label: [number, number] }>> = {
  cpu: { rings: [[268, 168, 288, 244]], label: [412, 392] },
  ram: { rings: [[582, 2, 186, 532]], label: [675, 270] },
  storage: { rings: [[166, 422, 392, 86]], label: [362, 466] },
  gpu: { rings: [[54, 530, 400, 56]], label: [300, 610] },
  motherboard: { rings: [[558, 734, 290, 214]], label: [706, 916] },
  battery: { rings: [[440, 742, 110, 110]], label: [470, 880] },
};

const veil = (rings: Ring[]) => `M0 0H${W}V${H}H0Z${rings.map(([x, y, w, h]) => `M${x} ${y}V${y + h}H${x + w}V${y}Z`).join("")}`;
const short = (name: string) => (name.length > 26 ? `${name.slice(0, 25)}…` : name);

export function BoardRender({ parts, active = null, onSelect, label }: { parts: DetectedPart[]; active?: PartSlot | null; onSelect?: (index: number) => void; label: string }) {
  const seen = new Set<PartSlot>();
  const shown = parts.map((part, index) => ({ part, index })).filter(({ part }) => PLACES[part.slot] && !seen.has(part.slot) && seen.add(part.slot));
  return (
    <div className="board-render" data-testing={active ? "true" : undefined}>
      <img src={board} alt={label} draggable={false} />
      <svg viewBox={`0 0 ${W} ${H}`} role="presentation">
        {shown.map(({ part, index }) => {
          const place = PLACES[part.slot]!;
          const text = short(part.name);
          const width = text.length * 12.2 + 28;
          return (
            <g key={part.slot} className="bp" data-active={active === part.slot || undefined} onClick={onSelect ? () => onSelect(index) : undefined} role={onSelect ? "button" : undefined} aria-label={part.name}>
              {place.rings.map(([x, y, w, h]) => (
                <rect key={`${x}-${y}`} className="bp-hit" x={x} y={y} width={w} height={h} rx={6} />
              ))}
              <path className="bp-veil" d={veil(place.rings)} fillRule="evenodd" />
              {place.rings.map(([x, y, w, h]) => (
                <rect key={`r${x}-${y}`} className="bp-ring" x={x} y={y} width={w} height={h} rx={6} />
              ))}
              <g className="bp-label">
                <rect x={place.label[0] - width / 2} y={place.label[1] - 18} width={width} height={36} rx={7} />
                <text x={place.label[0]} y={place.label[1] + 7.5} textAnchor="middle">
                  {text}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
