import type { DetectedPart, Hardware } from "../../shared/types";
import { webglRenderer } from "../engine/gpu-webgl";

/** What the native code reads on the phone (android/app/src/main/java/com/oltechx/check/OlxDevicePlugin.java). */
export type NativeInfo = {
  manufacturer: string;
  brand: string;
  model: string;
  deviceName?: string;
  android: string;
  sdk: number;
  socManufacturer?: string;
  socModel?: string;
  hardware: string;
  cores: number;
  maxMhz?: number;
  ramBytes: number;
  storageBytes: number;
  freeBytes: number;
  battery: { level?: number; health?: number; temperature?: number; plugged?: boolean; cycles?: number; technology?: string; chargeCounterUah?: number; designMah?: number };
  screen: string;
  deviceId?: string;
};

/** Chip codes to the names people know. */
const CHIPS: Record<string, string> = {
  SM8850: "Snapdragon 8 Elite Gen 5",
  SM8750: "Snapdragon 8 Elite",
  SM8650: "Snapdragon 8 Gen 3",
  SM8635: "Snapdragon 8s Gen 3",
  SM8550: "Snapdragon 8 Gen 2",
  SM8475: "Snapdragon 8+ Gen 1",
  SM8450: "Snapdragon 8 Gen 1",
  SM8350: "Snapdragon 888",
  SM8250: "Snapdragon 865",
  SM8150: "Snapdragon 855",
  SM7675: "Snapdragon 7+ Gen 3",
  SM7550: "Snapdragon 7 Gen 3",
  SM7475: "Snapdragon 7+ Gen 2",
  SM7450: "Snapdragon 7 Gen 1",
  SM7435: "Snapdragon 7s Gen 2",
  SM7325: "Snapdragon 778G",
  SM6450: "Snapdragon 6 Gen 1",
  SM6375: "Snapdragon 695",
  SM4450: "Snapdragon 4 Gen 2",
  MT6991: "Dimensity 9400",
  MT6989: "Dimensity 9300",
  MT6985: "Dimensity 9200",
  MT6983: "Dimensity 9000",
  MT6897: "Dimensity 8300",
  MT6896: "Dimensity 8200",
  MT6886: "Dimensity 7200",
  MT6878: "Dimensity 7300",
  MT6833: "Dimensity 700",
  MT6789: "Helio G99",
  MT6769: "Helio G85",
  S5E9955: "Exynos 2500",
  S5E9945: "Exynos 2400",
  S5E9925: "Exynos 2200",
  S5E8845: "Exynos 1480",
  S5E8835: "Exynos 1380",
};
const CHIP_MAKERS: Record<string, string> = { QTI: "Qualcomm", QUALCOMM: "Qualcomm", MEDIATEK: "MediaTek", MTK: "MediaTek", GOOGLE: "Google", SAMSUNG: "Samsung" };

function chipName(info: NativeInfo): string {
  const code = (info.socModel ?? info.hardware ?? "").toUpperCase();
  const maker = CHIP_MAKERS[(info.socManufacturer ?? "").toUpperCase()] ?? info.socManufacturer ?? "";
  const known = CHIPS[code];
  if (known) return `${maker || (known.startsWith("Snapdragon") ? "Qualcomm" : known.startsWith("Exynos") ? "Samsung" : "MediaTek")} ${known}`.trim();
  if (/tensor/i.test(code)) return `Google ${info.socModel}`;
  return [maker, info.socModel ?? info.hardware].filter(Boolean).join(" ");
}

/**
 * The name people know: Samsung keeps "Galaxy S24" in the device name, while the model is "SM-S921B".
 * A name the owner typed in ("Ivan's phone") is not used.
 */
export function phoneName(info: Pick<NativeInfo, "brand" | "manufacturer" | "model" | "deviceName">): string {
  const maker = info.brand || info.manufacturer;
  const typed = info.deviceName?.trim();
  const usable = typed && typed.length <= 40 && /\d/.test(typed) && !/['’]s\b|phone|телефон/i.test(typed) ? typed : null;
  const base = usable ?? info.model;
  return base.toLowerCase().startsWith(maker.toLowerCase()) ? base : `${maker} ${base}`;
}

/** Phones are sold as 8 GB or 256 GB, while the system reports a bit less: round up to the size on the box. */
const marketed = (value: number, sizes: number[]) => sizes.find((size) => size >= value * 0.98) ?? Math.round(value);

/** How much of the battery's original capacity is left, where the phone allows reading it. */
export function batteryHealth(battery: NativeInfo["battery"]): number | null {
  if (!battery.chargeCounterUah || !battery.designMah || !battery.level || battery.level < 15) return null;
  const full = battery.chargeCounterUah / 1000 / (battery.level / 100);
  const pct = (full / battery.designMah) * 100;
  return pct >= 40 && pct <= 115 ? Math.min(100, Math.round(pct)) : null;
}

export function phoneHardware(info: NativeInfo): Hardware {
  const name = phoneName(info);
  const ramGb = marketed(info.ramBytes / 1e9, [2, 3, 4, 6, 8, 12, 16, 18, 24, 32]);
  const storageGb = marketed(info.storageBytes / 1e9, [16, 32, 64, 128, 256, 512, 1024, 2048]);
  const health = batteryHealth(info.battery);
  const renderer = webglRenderer();
  const gpuName = renderer?.replace(/\(TM\)|\(R\)/g, "").replace(/\s+/g, " ").trim() ?? null;
  const goodCondition = info.battery.health === undefined || info.battery.health === 2;

  const parts: DetectedPart[] = [
    { slot: "phone", name, specs: { storageGb, ramGb, batteryHealth: health } },
    { slot: "cpu", name: chipName(info), specs: { cores: info.cores, threads: info.cores, boostMhz: info.maxMhz ?? null } },
    ...(gpuName ? [{ slot: "gpu" as const, name: gpuName, specs: {} }] : []),
    { slot: "ram", name: `${ramGb} GB RAM`, specs: { capacityGb: ramGb, ddr: "LPDDR" } },
    { slot: "storage", name: `${storageGb} GB`, specs: { kind: "UFS", capacityGb: storageGb } },
    {
      slot: "battery",
      name: info.battery.technology || "Li-ion",
      specs: { healthPct: health, cycles: info.battery.cycles ?? null },
      health:
        health !== null
          ? { label: "Капацитет", value: `${health}%`, ok: health >= 80 }
          : { label: "Състояние", value: goodCondition ? "Добро" : "Проблем", ok: goodCondition },
    },
  ];
  return {
    device: {
      kind: "phone",
      platform: `Android ${info.android}`,
      browser: null,
      gpuRenderer: renderer,
      gpuVendor: /adreno/i.test(renderer ?? "") ? "qualcomm" : /mali|immortalis/i.test(renderer ?? "") ? "arm" : null,
      gpuArchitecture: null,
      model: name,
      threads: info.cores,
      memoryGb: ramGb,
      screen: info.screen,
    },
    parts,
    onPower: info.battery.plugged ?? null,
    laptop: false,
    computerName: name,
    wholeOnly: true,
    vramMb: null,
    deviceName: name,
    serial: null,
    deviceId: info.deviceId ?? null,
  };
}
