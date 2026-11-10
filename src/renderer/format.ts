import type { DetectedPart, PartSlot } from "../shared/types";

export function formatRate(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toLocaleString("bg-BG", { maximumFractionDigits: 2 })} трлн.`;
  if (value >= 1e9) return `${(value / 1e9).toLocaleString("bg-BG", { maximumFractionDigits: 1 })} млрд.`;
  if (value >= 1e6) return `${(value / 1e6).toLocaleString("bg-BG", { maximumFractionDigits: 0 })} млн.`;
  return Math.round(value).toLocaleString("bg-BG");
}

export const SLOT_LABEL: Record<PartSlot, string> = {
  cpu: "Процесор",
  gpu: "Видеокарта",
  ram: "RAM памет",
  motherboard: "Дънна платка",
  storage: "Диск",
  battery: "Батерия",
  phone: "Телефон",
};

/** Частите, които се продават отделно. Батерията на лаптопа не е сред тях. */
export const SELLABLE: PartSlot[] = ["cpu", "gpu", "ram", "motherboard", "storage"];

const gb = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v >= 1000 ? `${(v / 1000).toLocaleString("bg-BG", { maximumFractionDigits: 1 })} TB` : `${Math.round(v)} GB`;
};

/** Същото кратко описание като в сайта. */
export function partSummary(part: DetectedPart): string {
  const s = part.specs;
  const join = (...items: unknown[]) => items.filter((item): item is string => typeof item === "string" && item.length > 0).join(" · ");
  switch (part.slot) {
    case "cpu":
      return join(s.cores ? `${s.cores} ядра` : null, s.threads ? `${s.threads} нишки` : null, s.boostMhz ? `до ${(Number(s.boostMhz) / 1000).toFixed(1)} GHz` : null);
    case "gpu":
      return join(s.vramGb ? `${s.vramGb} GB видео памет` : null, typeof s.driver === "string" ? `драйвер ${s.driver}` : null);
    case "ram":
      return join(gb(s.capacityGb), typeof s.ddr === "string" ? s.ddr : null, s.speedMhz ? `${s.speedMhz} MHz` : null, s.modules ? `${s.modules} ${Number(s.modules) === 1 ? "модул" : "модула"}` : null);
    case "storage":
      return join(typeof s.kind === "string" ? s.kind : null, gb(s.capacityGb));
    case "battery":
      return join(s.healthPct ? `${s.healthPct}% от новата` : null, s.cycles ? `${s.cycles} цикъла` : null);
    default:
      return "";
  }
}
