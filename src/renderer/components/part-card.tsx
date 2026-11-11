import { CheckIcon, FingerprintIcon, HeartPulseIcon } from "lucide-react";
import type { DetectedPart } from "../../shared/types";
import { partSummary, serialTail, slotLabel } from "../format";
import { useLang } from "../i18n";
import { PartIso } from "./iso-view";

/** One detected part with its drawing. With onToggle it becomes an "I'm selling this" checkbox. */
export function PartCard({ part, index, on, onToggle, onOpen }: { part: DetectedPart; index: number; on?: boolean; onToggle?: () => void; onOpen?: () => void }) {
  const { t, health } = useLang();
  const summary = partSummary(part, t);
  const tail = serialTail(part.serial);
  const body = (
    <>
      <span className="part-figure">
        <PartIso part={part} />
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
        {tail && (
          <span className="badge badge-serial" title={t("serialsHint")}>
            <FingerprintIcon aria-hidden="true" size={13} />
            {t("serial", { tail })}
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
  const style = { animationDelay: `${index * 70}ms` };
  return onToggle ? (
    <button type="button" className="part iso-host" data-on={on} aria-pressed={on} onClick={onToggle} style={style}>
      {body}
    </button>
  ) : onOpen ? (
    <button type="button" className="part iso-host" onClick={onOpen} style={style}>
      {body}
    </button>
  ) : (
    <div className="part iso-host" style={style}>
      {body}
    </div>
  );
}
