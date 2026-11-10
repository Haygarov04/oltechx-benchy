import { hostname } from "node:os";
import si from "systeminformation";
import type { DetectedPart, Hardware } from "../shared/types";

/**
 * Частите, както ги вижда системата. Имената са точно като в Windows, а моделите от каталога
 * ги намира сайтът. Нищо лично не се чете: без потребителско име, файлове и серийни номера.
 */

const GB = 1024 ** 3;
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
  const [cpu, graphics, mem, memLayout, board, disks, battery, os, system, temperature] = await Promise.all([
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
  ]);

  const parts: DetectedPart[] = [];
  const laptop = Boolean(battery?.hasBattery);

  // Процесор
  const cpuName = cleanCpu(`${/^(intel|amd|apple)$/i.test(cpu.manufacturer) && !cpu.brand.toLowerCase().startsWith(cpu.manufacturer.toLowerCase()) ? `${cpu.manufacturer} ` : ""}${cpu.brand}`);
  parts.push({
    slot: "cpu",
    name: cpuName,
    specs: { cores: cpu.physicalCores, threads: cpu.cores, baseMhz: Math.round(cpu.speed * 1000) || null, boostMhz: Math.round((cpu.speedMax || cpu.speed) * 1000) || null, socket: cpu.socket || null },
    health: temperature?.main ? { label: "Температура", value: `${Math.round(temperature.main)} °C`, ok: temperature.main < 90 } : null,
  });

  // Видеокарта: отделната, ако има, иначе вградената. Виртуалните адаптери се пропускат.
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

  // RAM: модулите заедно, защото така се продават.
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

  // Дънната платка се продава отделно само при настолен компютър.
  if (!laptop && board?.model && !/to be filled|default string|system product/i.test(board.model)) {
    parts.push({ slot: "motherboard", name: `${board.manufacturer} ${board.model}`.replace(/\s+/g, " ").trim(), specs: { formFactor: null } });
  }

  // Вътрешните дискове, без флашки и външни.
  for (const disk of disks.filter((d) => d.size > 16 * GB && !/usb/i.test(d.interfaceType))) {
    parts.push({
      slot: "storage",
      name: disk.name.replace(/\s+/g, " ").trim() || `${diskKind(disk)} ${Math.round(disk.size / 1e9)} GB`,
      specs: { kind: diskKind(disk), capacityGb: Math.round(disk.size / 1e9) },
      health: smart(disk.smartStatus),
    });
  }

  // Батерията на лаптопа: колко от новия капацитет е останал.
  if (battery?.hasBattery && battery.designedCapacity > 0) {
    const health = round1(Math.min(100, (battery.maxCapacity / battery.designedCapacity) * 100));
    parts.push({
      slot: "battery",
      name: `Батерия ${battery.manufacturer || ""}`.trim(),
      specs: { healthPct: Math.round(health), cycles: battery.cycleCount || null },
      health: { label: "Капацитет", value: `${Math.round(health)}%`, ok: health >= 80 },
    });
  }

  const display = graphics.displays.find((d) => d.main) ?? graphics.displays[0];
  const platform = platformName(os.distro, os.release);
  const model = laptop ? [system?.manufacturer, system?.model].filter(Boolean).join(" ") || null : board?.model || null;
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
    vramMb,
    deviceName: `${hostname()} · ${platform}`.slice(0, 80),
  };
}
