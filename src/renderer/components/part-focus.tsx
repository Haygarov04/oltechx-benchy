import { FingerprintIcon, HeartPulseIcon, MoveHorizontalIcon, XIcon } from "lucide-react";
import { useEffect } from "react";
import type { DetectedPart } from "../../shared/types";
import { partSummary, serialTail, slotLabel } from "../format";
import { useLang } from "../i18n";
import { LiveModel } from "./model-view";

/** A part opened large: a model to turn by hand and everything known about it. */
export function PartFocus({ part, onClose }: { part: DetectedPart; onClose: () => void }) {
  const { t, health } = useLang();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const tail = serialTail(part.serial);
  const facts = partSummary(part, t).split(" · ").filter(Boolean);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={part.name} onClick={onClose}>
      <div className="focus card" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="btn btn-ghost focus-close" aria-label={t("close")} onClick={onClose}>
          <XIcon aria-hidden="true" />
        </button>
        <div className="focus-model">
          <LiveModel source={{ part }} label={part.name} />
          <span className="focus-hint">
            <MoveHorizontalIcon aria-hidden="true" size={14} />
            {t("dragToTurn")}
          </span>
        </div>
        <div className="focus-text">
          <div className="silk">{slotLabel(part.slot, t)}</div>
          <h2 className="plate-name" style={{ fontSize: 34 }}>
            {part.name}
          </h2>
          <div className="specs-line">
            {facts.map((fact) => (
              <span key={fact} className="chip">
                {fact}
              </span>
            ))}
          </div>
          {part.health && (
            <span className={`badge ${part.health.ok ? "badge-ok" : "badge-bad"}`} style={{ marginTop: 14 }}>
              <HeartPulseIcon aria-hidden="true" size={13} />
              {health(part.health.label)}: {health(part.health.value)}
            </span>
          )}
          {tail && (
            <p className="muted row" style={{ fontSize: 13.5, alignItems: "flex-start", marginTop: 14 }}>
              <FingerprintIcon aria-hidden="true" size={16} style={{ flex: "none", marginTop: 2 }} />
              <span>
                <strong className="mono">{t("serial", { tail })}</strong>
                <br />
                {t("serialsHint")}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
