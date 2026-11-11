import type { DetectedPart, PartSlot } from "../shared/types";
import type { Lang, T } from "./i18n";

export function formatRate(value: number, lang: Lang): string {
  const locale = lang === "bg" ? "bg-BG" : "en-GB";
  const [trillion, billion, million] = lang === "bg" ? ["трлн.", "млрд.", "млн."] : ["T", "B", "M"];
  if (value >= 1e12) return `${(value / 1e12).toLocaleString(locale, { maximumFractionDigits: 2 })} ${trillion}`;
  if (value >= 1e9) return `${(value / 1e9).toLocaleString(locale, { maximumFractionDigits: 1 })} ${billion}`;
  if (value >= 1e6) return `${(value / 1e6).toLocaleString(locale, { maximumFractionDigits: 0 })} ${million}`;
  return Math.round(value).toLocaleString(locale);
}

const SLOT_KEY = {
  cpu: "slotCpu",
  gpu: "slotGpu",
  ram: "slotRam",
  motherboard: "slotMotherboard",
  storage: "slotStorage",
  battery: "slotBattery",
  phone: "slotPhone",
} as const satisfies Record<PartSlot, Parameters<T>[0]>;

export const slotLabel = (slot: PartSlot, t: T) => t(SLOT_KEY[slot]);

/** Parts that can be sold on their own. A laptop battery is not one of them. */
export const SELLABLE: PartSlot[] = ["cpu", "gpu", "ram", "motherboard", "storage"];

const size = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v >= 1000 ? `${Math.round(v / 100) / 10} TB` : `${Math.round(v)} GB`;
};

/** A one-line summary of the key numbers, the same as on the site. */
export function partSummary(part: DetectedPart, t: T): string {
  const s = part.specs;
  const join = (...items: unknown[]) => items.filter((item): item is string => typeof item === "string" && item.length > 0).join(" · ");
  switch (part.slot) {
    case "cpu":
      return join(s.cores ? t("cores", { n: Number(s.cores) }) : null, s.threads ? t("threads", { n: Number(s.threads) }) : null, s.boostMhz ? t("upTo", { n: (Number(s.boostMhz) / 1000).toFixed(1) }) : null);
    case "gpu":
      return join(s.vramGb ? t("videoMemory", { n: Number(s.vramGb) }) : null, typeof s.driver === "string" ? t("driver", { v: s.driver }) : null);
    case "ram":
      return join(size(s.capacityGb), typeof s.ddr === "string" ? s.ddr : null, s.speedMhz ? `${s.speedMhz} MHz` : null, s.modules ? t(Number(s.modules) === 1 ? "module" : "modules", { n: Number(s.modules) }) : null);
    case "storage":
      return join(typeof s.kind === "string" ? s.kind : null, size(s.capacityGb));
    case "battery":
      return join(s.healthPct ? t("ofNew", { n: Number(s.healthPct) }) : null, s.cycles ? t("cycles", { n: Number(s.cycles) }) : null);
    default:
      return "";
  }
}
