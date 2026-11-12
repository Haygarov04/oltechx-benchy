import { useEffect, useState } from "react";
import type { DetectedPart } from "../../shared/types";
import { partModel } from "../three/models";
import { picture } from "../three/stage";
import { partSlug, Render } from "./render";

/**
 * The picture of a part. The site's renders where they show the real thing (a desktop processor,
 * a graphics card, a memory module, a 2.5" drive). Where they would show something else, a model
 * of the actual part: an Apple chip with its memory, soldered memory, an M.2 or phone drive, a laptop battery.
 */
function needsModel(part: DetectedPart) {
  if (part.slot === "battery" || part.slot === "phone") return true;
  if ((part.slot === "cpu" || part.slot === "gpu") && /^apple/i.test(part.name)) return true;
  if (part.slot === "ram" && /lpddr/i.test(String(part.specs.ddr ?? part.name))) return true;
  if (part.slot === "storage" && /nvme|ufs/i.test(String(part.specs.kind ?? ""))) return true;
  return false;
}

const key = (part: DetectedPart) => `${part.slot}|${part.name}|${part.specs.kind ?? ""}|${part.specs.ddr ?? ""}|${part.specs.capacityGb ?? ""}|${part.specs.healthPct ?? ""}`;

function ModelStill({ part, live }: { part: DetectedPart; live?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => picture(`still|${key(part)}`, () => partModel(part), 448, 448)).then((url) => alive && setSrc(url), () => undefined);
    return () => {
      alive = false;
    };
  }, [part]);
  return (
    <span className="render" data-live={live || undefined}>
      {src ? <img className="model-still" src={src} alt={part.name} draggable={false} /> : <span className="model-loading" aria-hidden="true" />}
    </span>
  );
}

export function PartImage({ part, live }: { part: DetectedPart; live?: boolean }) {
  return needsModel(part) ? <ModelStill part={part} live={live} /> : <Render slug={partSlug(part)} label={part.name} live={live} />;
}
