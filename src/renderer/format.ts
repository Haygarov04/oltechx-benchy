import type { DetectedPart, PartSlot } from "../shared/types";
import type { Lang, T } from "./i18n";

const locale = (lang: Lang) => (lang === "bg" ? "bg-BG" : "en-GB");
const num = (value: number, lang: Lang, digits: number) => value.toLocaleString(locale(lang), { maximumFractionDigits: digits });

export type Unit = "ops" | "flops" | "bytes" | "mb" | "ns" | "iops";

/** A measurement as a number and a unit, for example { value: "12,4", unit: "GB/s" }. */
export function measure(value: number, unit: Unit, lang: Lang): { value: string; unit: string } {
  switch (unit) {
    case "ops": {
      const [trillion, billion, million, calc] = lang === "bg" ? ["трлн.", "млрд.", "млн.", "изч./с"] : ["T", "B", "M", "calc/s"];
      if (value >= 1e12) return { value: num(value / 1e12, lang, 2), unit: `${trillion} ${calc}` };
      if (value >= 1e9) return { value: num(value / 1e9, lang, 1), unit: `${billion} ${calc}` };
      return { value: num(value / 1e6, lang, 0), unit: `${million} ${calc}` };
    }
    case "flops":
      return value >= 1e12 ? { value: num(value / 1e12, lang, 2), unit: "TFLOPS" } : { value: num(value / 1e9, lang, value >= 1e11 ? 0 : 1), unit: "GFLOPS" };
    case "bytes":
      return value >= 1e9 ? { value: num(value / 1e9, lang, 1), unit: "GB/s" } : { value: num(value / 1e6, lang, 0), unit: "MB/s" };
    case "mb":
      return value >= 1024 ? { value: num(value / 1024, lang, 1), unit: "GB" } : { value: num(value, lang, 0), unit: "MB" };
    case "ns":
      return { value: num(value, lang, 0), unit: lang === "bg" ? "нс" : "ns" };
    case "iops":
      return { value: num(Math.round(value), lang, 0), unit: "IOPS" };
  }
}

export const show = (value: number, unit: Unit, lang: Lang) => {
  const m = measure(value, unit, lang);
  return `${m.value} ${m.unit}`;
};

/** The old short form, kept for the summary line: "2,1 трлн.". */
export function formatRate(value: number, lang: Lang): string {
  return measure(value, "ops", lang).value + (value >= 1e12 ? (lang === "bg" ? " трлн." : " T") : value >= 1e9 ? (lang === "bg" ? " млрд." : " B") : lang === "bg" ? " млн." : " M");
}

/** The end of a load compared with its start: 1 means no slowdown from heat. The same rule as on the site. */
export function stability(samples: number[] | undefined): number | null {
  if (!samples || samples.length < 6) return null;
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];
  const third = Math.floor(samples.length / 3);
  const first = median(samples.slice(0, third));
  const last = median(samples.slice(-third));
  return first > 0 ? Math.min(1, last / first) : null;
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

/** The last 4 characters of a serial number: what the buyer compares with the sticker. */
export const serialTail = (serial: string | null | undefined) => (serial ? serial.replace(/[^0-9a-z]/gi, "").slice(-4).toUpperCase() : null);
