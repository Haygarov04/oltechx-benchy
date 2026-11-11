import { BatteryIcon, CheckIcon, CircuitBoardIcon, CpuIcon, GaugeIcon, HardDriveIcon, HeartPulseIcon, MemoryStickIcon, SmartphoneIcon } from "lucide-react";
import type { DetectedPart, PartSlot } from "../../shared/types";
import { partSummary, slotLabel } from "../format";
import { useLang } from "../i18n";

const ICONS: Record<PartSlot, typeof CpuIcon> = {
  cpu: CpuIcon,
  gpu: GaugeIcon,
  ram: MemoryStickIcon,
  motherboard: CircuitBoardIcon,
  storage: HardDriveIcon,
  battery: BatteryIcon,
  phone: SmartphoneIcon,
};

/** One detected part. With onToggle it becomes an "I'm selling this" checkbox. */
export function PartCard({ part, index, on, onToggle }: { part: DetectedPart; index: number; on?: boolean; onToggle?: () => void }) {
  const { t, health } = useLang();
  const Icon = ICONS[part.slot];
  const summary = partSummary(part, t);
  const body = (
    <>
      <span className="die">
        <Icon aria-hidden="true" />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="silk">{slotLabel(part.slot, t)}</span>
        <span className="part-name" style={{ display: "block" }}>
          {part.name}
        </span>
        {summary && (
          <span className="part-meta" style={{ display: "block" }}>
            {summary}
          </span>
        )}
        {part.health && (
          <span className={`badge ${part.health.ok ? "badge-ok" : "badge-bad"}`}>
            <HeartPulseIcon aria-hidden="true" size={13} />
            {health(part.health.label)}: {health(part.health.value)}
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
