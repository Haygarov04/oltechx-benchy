import type { DetectedPart, Hardware } from "../../shared/types";
import { deviceModel, partModel } from "../three/models";
import { LiveModel, ModelPicture } from "./model-view";

/**
 * Every 3D model side by side, for checking how they look (open the app with #models).
 * Not reachable from the interface.
 */

const part = (slot: DetectedPart["slot"], name: string, specs: DetectedPart["specs"] = {}): DetectedPart => ({ slot, name, specs });

const device = (computerName: string | null, platform: string, laptop: boolean, parts: DetectedPart[] = [], kind: Hardware["device"]["kind"] = "computer"): Hardware => ({
  device: { kind, platform, browser: null, gpuRenderer: null, gpuVendor: null, gpuArchitecture: null, model: computerName, threads: 16, memoryGb: 32, screen: null },
  parts,
  onPower: laptop ? true : null,
  laptop,
  computerName,
  wholeOnly: laptop,
  vramMb: null,
  deviceName: "test",
  serial: null,
});

const rtx = part("gpu", "NVIDIA GeForce RTX 4070 SUPER", { vramGb: 12 });
const DEVICES: [string, Hardware][] = [
  ["MacBook Air", device("MacBook Air (15-inch, M5)", "macOS", true)],
  ["MacBook Pro", device("MacBook Pro (14-inch, M4 Pro)", "macOS", true)],
  ["iMac", device("iMac (24-inch, 2024)", "macOS", false)],
  ["Mac mini", device("Mac mini (2024)", "macOS", false)],
  ["Gaming laptop", device("Lenovo Legion 5 15ACH6H", "Windows 11 Home", true, [rtx])],
  ["Office laptop", device("Dell Latitude 5440", "Windows 11 Pro", true, [part("gpu", "Intel Iris Xe Graphics")])],
  ["Desktop", device(null, "Windows 11 Pro", false, [rtx])],
  ["Android", device("Samsung Galaxy S24", "Android 15", false, [], "phone")],
];
const PARTS: DetectedPart[] = [
  part("cpu", "AMD Ryzen 7 7800X3D 8-Core Processor"),
  part("cpu", "Intel Core i7-14700K"),
  part("cpu", "Apple M4 Pro"),
  rtx,
  part("gpu", "AMD Radeon RX 7800 XT", { vramGb: 16 }),
  part("ram", "Kingston FURY Beast RGB 2×16 GB DDR5", { ddr: "DDR5", capacityGb: 32 }),
  part("ram", "Corsair 2×8 GB DDR4", { ddr: "DDR4", capacityGb: 16 }),
  part("ram", "16 GB LPDDR5", { ddr: "LPDDR5", capacityGb: 16 }),
  part("storage", "Samsung SSD 990 PRO 2TB", { kind: "NVMe SSD", capacityGb: 2000 }),
  part("storage", "Crucial MX500 1TB", { kind: "SATA SSD", capacityGb: 1000 }),
  part("storage", "Seagate Barracuda 4TB", { kind: "HDD", capacityGb: 4000 }),
  part("motherboard", "ASUS TUF GAMING B650-PLUS"),
  part("battery", "Lenovo", { healthPct: 87, cycles: 210 }),
];

export function Gallery() {
  return (
    <main className="main">
      <h1 className="display h1">3D</h1>
      <div className="card" style={{ height: 420 }}>
        <LiveModel source={{ hardware: DEVICES[6][1] }} active label="Desktop" />
      </div>
      <div className="gallery">
        {DEVICES.map(([label, hardware]) => (
          <figure key={label} className="card gallery-item">
            <ModelPicture id={`device-${label}`} build={() => deviceModel(hardware)} label={label} />
            <figcaption className="silk">{label}</figcaption>
          </figure>
        ))}
        {PARTS.map((p) => (
          <figure key={p.name} className="card gallery-item">
            <ModelPicture id={`part-${p.name}`} build={() => partModel(p)} label={p.name} />
            <figcaption className="silk">{p.name}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
