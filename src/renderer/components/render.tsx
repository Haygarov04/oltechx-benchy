import type { CSSProperties } from "react";
import type { DetectedPart, Hardware } from "../../shared/types";

/**
 * The ray-traced renders from oltechx.com: a still frame of each part and a strip of 20 frames
 * that turns it around. They are finished pictures, so the app computes nothing while it tests.
 */

const stills = import.meta.glob<string>("../assets/renders/*-448.webp", { eager: true, query: "?url", import: "default" });
const spins = import.meta.glob<string>("../assets/renders/*-spin.webp", { eager: true, query: "?url", import: "default" });
const file = (set: Record<string, string>, slug: string, kind: string) => set[`../assets/renders/${slug}-${kind}.webp`];

export function partSlug(part: DetectedPart): string {
  switch (part.slot) {
    case "cpu":
      return "procesori";
    case "gpu":
      // Graphics inside the processor is shown as the chip it lives in.
      return /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|rx \d|arc a|arc b/i.test(part.name) ? "videokarti" : "procesori";
    case "ram":
      return "ram-pamet";
    case "storage":
      return "diskove";
    case "motherboard":
      return "dunni-platki";
    case "battery":
      return "vunshni-baterii";
    default:
      return "telefoni";
  }
}

export function deviceSlug(hardware: Hardware): string {
  const name = hardware.computerName ?? "";
  if (hardware.device.kind === "phone") return "telefoni";
  if (hardware.device.kind === "tablet") return "tableti";
  if (/imac/i.test(name)) return "aio-kompyutri";
  if (/mac mini|mac studio/i.test(name)) return "mini-kompyutri";
  if (hardware.laptop || /macbook/i.test(name)) return "laptopi";
  if (/mac/i.test(name)) return "mini-kompyutri";
  return "nastolni-kompyutri";
}

/** A render that turns when its host (class "render-host") is hovered, or always with `live`. */
export function Render({ slug, live = false, label }: { slug: string; live?: boolean; label: string }) {
  return (
    <span className="render" data-live={live || undefined} style={{ "--spin": `url("${file(spins, slug, "spin")}")` } as CSSProperties}>
      <img className="render-still" src={file(stills, slug, "448")} alt={label} draggable={false} />
      <span className="render-spin" aria-hidden="true" />
    </span>
  );
}
