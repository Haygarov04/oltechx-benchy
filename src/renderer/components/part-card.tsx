import { BatteryIcon, CheckIcon, CircuitBoardIcon, CpuIcon, GaugeIcon, HardDriveIcon, HeartPulseIcon, MemoryStickIcon, SmartphoneIcon } from "lucide-react";
import type { DetectedPart, PartSlot } from "../../shared/types";
import { partSummary, SLOT_LABEL } from "../format";

const ICONS: Record<PartSlot, typeof CpuIcon> = {
  cpu: CpuIcon,
  gpu: GaugeIcon,
  ram: MemoryStickIcon,
  motherboard: CircuitBoardIcon,
  storage: HardDriveIcon,
  battery: BatteryIcon,
  phone: SmartphoneIcon,
};

/** Една разпозната част. С onToggle става отметка „продавам я“. */
export function PartCard({ part, index, on, onToggle }: { part: DetectedPart; index: number; on?: boolean; onToggle?: () => void }) {
  const Icon = ICONS[part.slot];
  const body = (
    <>
      <span className="die">
        <Icon aria-hidden="true" />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="silk">{SLOT_LABEL[part.slot]}</span>
        <span className="part-name" style={{ display: "block" }}>
          {part.name}
        </span>
        {partSummary(part) && <span className="part-meta" style={{ display: "block" }}>{partSummary(part)}</span>}
        {part.health && (
          <span className={`badge ${part.health.ok ? "badge-ok" : "badge-bad"}`}>
            <HeartPulseIcon aria-hidden="true" size={13} />
            {part.health.label}: {part.health.value}
          </span>
        )}
      </span>
      {onToggle && (
        <span className="tick" aria-hidden="true">
          {on && <CheckIcon />}
        </span>
      )}
    </>
  );
  const style = { animationDelay: `${index * 90}ms` };
  return onToggle ? (
    <button type="button" className="part" data-on={on} aria-pressed={on} onClick={onToggle} style={style}>
      {body}
    </button>
  ) : (
    <div className="part" style={style}>
      {body}
    </div>
  );
}
