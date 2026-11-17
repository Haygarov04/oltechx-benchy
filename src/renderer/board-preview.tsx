// Development only: the board with typical parts of a Windows desktop, a laptop or a phone, to look at
// the 3D view without that machine. npx vite --port 5199, then open /board-preview.html#desktop or #desktop-office.
import "@fontsource/sofia-sans/400.css";
import "@fontsource/sofia-sans/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import type { DetectedPart } from "../shared/types";
import { BoardView } from "./components/board-view";

const DESKTOP: DetectedPart[] = [
  { slot: "cpu", name: "AMD Ryzen 7 5800X3D 8-Core Processor", specs: { cores: 8, threads: 16, socket: "AM4" } },
  { slot: "gpu", name: "NVIDIA GeForce RTX 3070", specs: { vramGb: 8, vendor: "NVIDIA" } },
  { slot: "ram", name: "Kingston 2×16 GB DDR4", specs: { ddr: "DDR4", capacityGb: 32, modules: 2, speedMhz: 3600 } },
  { slot: "motherboard", name: "ASUSTeK COMPUTER INC. ROG STRIX B550-F GAMING", specs: { formFactor: null } },
  { slot: "storage", name: "Samsung SSD 980 PRO 1TB", specs: { kind: "NVMe", capacityGb: 1000 } },
  { slot: "storage", name: "ST2000DM008-2FR102", specs: { kind: "HDD", capacityGb: 2000 } },
];

// A second desktop: four sticks, two NVMe drives, a SATA SSD and graphics in the processor.
const OFFICE: DetectedPart[] = [
  { slot: "cpu", name: "Intel(R) Core(TM) i5-12400", specs: { cores: 6, threads: 12, socket: "LGA1700" } },
  { slot: "gpu", name: "Intel(R) UHD Graphics 730", specs: { vramGb: null, vendor: "Intel" } },
  { slot: "ram", name: "Corsair Vengeance 4×8 GB DDR5", specs: { ddr: "DDR5", capacityGb: 32, modules: 4, speedMhz: 5600 } },
  { slot: "storage", name: "WD Black SN770 1TB", specs: { kind: "NVMe", capacityGb: 1000 } },
  { slot: "storage", name: "Crucial P3 500GB", specs: { kind: "NVMe", capacityGb: 500 } },
  { slot: "storage", name: "Samsung SSD 870 EVO 500GB", specs: { kind: "SATA SSD", capacityGb: 500 } },
];

const [kindHash, set] = location.hash.slice(1).split("-");
const kind = (kindHash || "desktop") as "desktop" | "laptop" | "phone";
createRoot(document.getElementById("root")!).render(
  <div style={{ width: "100vw", height: "100vh" }} className="board-preview">
    <BoardView parts={set === "office" ? OFFICE : DESKTOP} kind={kind} label="preview" />
  </div>,
);
