import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { promisify } from "node:util";
import si from "systeminformation";
import type { DetectedPart, Hardware } from "../shared/types";

/**
 * The parts as the operating system reports them. Names are kept exactly as Windows shows them;
 * the site matches them to its catalog. Nothing personal is read: no user name, files or serial numbers.
 * Health labels stay in Bulgarian because the site displays them; the app translates them for display.
 */

const run = promisify(execFile);
const GB = 1024 ** 3;

/** The marketing name of a Mac, for example "MacBook Air (15-inch, M5)". */
async function macModelName(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await run("ioreg", ["-arc", "IOPlatformDevice", "-k", "product-name"], { timeout: 4000 });
    const data = stdout.match(/<key>product-name<\/key>\s*<data>([\s\S]*?)<\/data>/)?.[1];
    if (data) return Buffer.from(data.replace(/\s+/g, ""), "base64").toString("utf8").replace(/\0/g, "").trim() || null;
  } catch {
    // Older macOS without the name: fall back to the short model name below.
  }
  try {
    const { stdout } = await run("system_profiler", ["SPHardwareDataType", "-json"], { timeout: 8000 });
    return (JSON.parse(stdout).SPHardwareDataType?.[0]?.machine_name as string) || null;
  } catch {
    return null;
  }
}

const VENDORS: [RegExp, string][] = [
  [/micro-star|^msi/i, "MSI"],
  [/asustek|^asus/i, "ASUS"],
  [/^dell/i, "Dell"],
  [/lenovo/i, "Lenovo"],
  [/hewlett|^hp/i, "HP"],
  [/^acer/i, "Acer"],
  [/gigabyte/i, "Gigabyte"],
  [/microsoft/i, "Microsoft"],
  [/samsung/i, "Samsung"],
  [/huawei/i, "Huawei"],
  [/razer/i, "Razer"],
  [/apple/i, "Apple"],
];
/** Brands that sell complete desktops. Other makers' desktops are usually custom builds with a board name. */
const PREBUILT = new Set(["Dell", "HP", "Lenovo", "Acer", "Apple", "Microsoft"]);
const GENERIC = /to be filled|system product|default string|o\.?e\.?m|not applicable|not specified|^\s*$|^0+$/i;

/**
 * The model of a laptop or a ready-made PC, for example "Lenovo Legion 5 15ACH6H" or "Dell XPS 15 9520".
 * Lenovo keeps the real name in "version". A custom-built desktop has no model: null.
 */
function pcModelName(system: si.Systeminformation.SystemData | null, laptop: boolean): string | null {
  if (!system) return null;
  const vendor = VENDORS.find(([pattern]) => pattern.test(system.manufacturer))?.[1] ?? null;
  if (!vendor || (!laptop && !PREBUILT.has(vendor))) return null;
  const candidates = [vendor === "Lenovo" ? system.version : null, system.model];
  const model = candidates.find((c): c is string => Boolean(c && !GENERIC.test(c) && !/^ms-\w+$/i.test(c)));
  if (!model) return null;
  return model.toLowerCase().startsWith(vendor.toLowerCase()) ? model.trim() : `${vendor} ${model.trim()}`;
}
const VIRTUAL = /microsoft basic|remote|virtual|parsec|citrix|vmware|hyper-v|displaylink|idd/i;

const round1 = (n: number) => Math.round(n * 10) / 10;
const cleanCpu = (brand: string) => brand.replace(/\s+/g, " ").trim();

function platformName(distro: string, release: string) {
  const name = distro.replace(/^Microsoft\s+/i, "").trim();
  return name || release;
}

function diskKind(disk: si.Systeminformation.DiskLayoutData): "NVMe SSD" | "SATA SSD" | "HDD" {
  if (/nvme|pcie/i.test(disk.interfaceType) || /nvme/i.test(disk.name)) return "NVMe SSD";
  if (disk.type === "SSD" || /ssd/i.test(disk.name)) return "SATA SSD";
  return "HDD";
}

function smart(status: string): { label: string; value: string; ok: boolean } | null {
  if (/ok|passed|healthy/i.test(status)) return { label: "SMART", value: "Наред", ok: true };
  if (/fail|predict|bad/i.test(status)) return { label: "SMART", value: "Предупреждение", ok: false };
  return null;
}

export async function scanHardware(): Promise<Hardware> {
  const [cpu, graphics, mem, memLayout, board, disks, battery, os, system, temperature, macName] = await Promise.all([
    si.cpu(),
    si.graphics(),
    si.mem(),
    si.memLayout().catch(() => []),
    si.baseboard().catch(() => null),
    si.diskLayout().catch(() => []),
    si.battery().catch(() => null),
    si.osInfo(),
    si.system().catch(() => null),
    si.cpuTemperature().catch(() => null),
    macModelName(),
  ]);

  const parts: DetectedPart[] = [];
  const laptop = Boolean(battery?.hasBattery);

  // Processor
  const cpuName = cleanCpu(`${/^(intel|amd|apple)$/i.test(cpu.manufacturer) && !cpu.brand.toLowerCase().startsWith(cpu.manufacturer.toLowerCase()) ? `${cpu.manufacturer} ` : ""}${cpu.brand}`);
  parts.push({
    slot: "cpu",
    name: cpuName,
    specs: { cores: cpu.physicalCores, threads: cpu.cores, baseMhz: Math.round(cpu.speed * 1000) || null, boostMhz: Math.round((cpu.speedMax || cpu.speed) * 1000) || null, socket: cpu.socket || null },
    health: temperature?.main ? { label: "Температура", value: `${Math.round(temperature.main)} °C`, ok: temperature.main < 90 } : null,
  });

  // Graphics: the dedicated card if there is one, otherwise the integrated one. Virtual adapters are skipped.
  const controllers = graphics.controllers.filter((c) => c.model && !VIRTUAL.test(c.model));
  const discrete = controllers.filter((c) => /nvidia|amd|ati|advanced micro/i.test(c.vendor) && !/radeon\(tm\) graphics|vega \d+ graphics/i.test(c.model));
  const gpu = [...(discrete.length ? discrete : controllers)].sort((a, b) => (b.memoryTotal ?? b.vram ?? 0) - (a.memoryTotal ?? a.vram ?? 0))[0];
  const vramMb = gpu ? (gpu.memoryTotal ?? gpu.vram ?? null) : null;
  if (gpu) {
    parts.push({
      slot: "gpu",
      name: gpu.model.replace(/\s+/g, " ").trim(),
      specs: { vramGb: vramMb ? Math.round(vramMb / 1024) : null, driver: gpu.driverVersion || null, vendor: gpu.vendor || null },
      health: typeof gpu.temperatureGpu === "number" ? { label: "Температура", value: `${Math.round(gpu.temperatureGpu)} °C`, ok: gpu.temperatureGpu < 85 } : null,
    });
  }

  // RAM: all modules together, because that is how they are sold.
  const modules = memLayout.filter((m) => m.size > 0);
  const capacityGb = Math.round((modules.reduce((sum, m) => sum + m.size, 0) || mem.total) / GB);
  const speeds = modules.map((m) => m.clockSpeed).filter((s): s is number => typeof s === "number" && s > 0);
  const types = [...new Set(modules.map((m) => m.type).filter((t) => /ddr/i.test(t ?? "")))];
  const makers = [...new Set(modules.map((m) => (m.manufacturer || "").trim()).filter((m) => m && !/unknown|undefined/i.test(m)))];
  parts.push({
    slot: "ram",
    name: `${makers.length === 1 ? `${makers[0]} ` : ""}${modules.length > 1 ? `${modules.length}×${Math.round(modules[0].size / GB)} GB` : `${capacityGb} GB`} ${types[0] ?? ""}`.replace(/\s+/g, " ").trim(),
    specs: { ddr: types[0]?.toUpperCase() ?? null, capacityGb, modules: modules.length || null, speedMhz: speeds.length ? Math.min(...speeds) : null },
  });

  // The motherboard is sold separately only from a desktop.
  if (!laptop && board?.model && !/to be filled|default string|system product/i.test(board.model)) {
    parts.push({ slot: "motherboard", name: `${board.manufacturer} ${board.model}`.replace(/\s+/g, " ").trim(), specs: { formFactor: null } });
  }

  // Internal drives only, no USB sticks or external disks.
  for (const disk of disks.filter((d) => d.size > 16 * GB && !/usb/i.test(d.interfaceType))) {
    parts.push({
      slot: "storage",
      name: disk.name.replace(/\s+/g, " ").trim() || `${diskKind(disk)} ${Math.round(disk.size / 1e9)} GB`,
      specs: { kind: diskKind(disk), capacityGb: Math.round(disk.size / 1e9) },
      health: smart(disk.smartStatus),
    });
  }

  // Laptop battery: how much of the original capacity is left.
  if (battery?.hasBattery && battery.designedCapacity > 0) {
    const health = round1(Math.min(100, (battery.maxCapacity / battery.designedCapacity) * 100));
    parts.push({
      slot: "battery",
      name: (battery.manufacturer || battery.model || "Battery").trim(),
      specs: { healthPct: Math.round(health), cycles: battery.cycleCount || null },
      health: { label: "Капацитет", value: `${Math.round(health)}%`, ok: health >= 80 },
    });
  }

  const display = graphics.displays.find((d) => d.main) ?? graphics.displays[0];
  const platform = platformName(os.distro, os.release);
  // The computer itself: a Mac, a laptop or a ready-made PC. A custom build is known by its parts.
  const model = macName ?? pcModelName(system, laptop);
  const mac = process.platform === "darwin";
  return {
    device: {
      kind: "computer",
      platform,
      browser: null,
      gpuRenderer: gpu?.model ?? null,
      gpuVendor: gpu?.vendor?.toLowerCase() ?? null,
      gpuArchitecture: null,
      model,
      threads: cpu.cores,
      memoryGb: Math.round(mem.total / GB),
      screen: display?.resolutionX ? `${display.resolutionX}×${display.resolutionY}` : null,
    },
    parts,
    onPower: battery?.hasBattery ? battery.acConnected : null,
    laptop,
    computerName: model,
    // Macs and laptops are sold whole: their parts are soldered in.
    wholeOnly: laptop || mac,
    vramMb,
    deviceName: `${hostname()} · ${platform}`.slice(0, 80),
  };
}
