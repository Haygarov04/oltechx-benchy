import { useEffect, useState } from "react";
import type { DetectedPart, Hardware } from "../../shared/types";
import { AllInOne, Cpu, Desktop, Gpu, Laptop, MiniPc, Motherboard, Phone, PowerBank, Ram, Storage } from "./iso-figures";

/**
 * The figures from oltechx.com for the parts and the device. A figure is "live" when its parts
 * lift apart, fans spin and screens light up; with `loop` it opens and closes on its own.
 */

function useLoop(on: boolean, period = 2600) {
  const [live, setLive] = useState(on);
  useEffect(() => {
    if (!on) return;
    setLive(true);
    const timer = setInterval(() => setLive((value) => !value), period);
    return () => clearInterval(timer);
  }, [on, period]);
  return on && live;
}

function partFigure(part: DetectedPart) {
  switch (part.slot) {
    case "cpu":
      return <Cpu />;
    case "gpu":
      // Graphics inside the processor is drawn as the chip it lives in.
      return /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|rx \d|arc a|arc b/i.test(part.name) ? <Gpu /> : <Cpu />;
    case "ram":
      return <Ram />;
    case "storage":
      return <Storage />;
    case "motherboard":
      return <Motherboard />;
    case "battery":
      return <PowerBank />;
    default:
      return <Phone />;
  }
}

function deviceFigure(hardware: Hardware) {
  const name = hardware.computerName ?? "";
  if (hardware.device.kind === "phone") return <Phone />;
  if (/imac/i.test(name)) return <AllInOne />;
  if (/mac mini|mac studio/i.test(name)) return <MiniPc />;
  if (hardware.laptop || /macbook/i.test(name)) return <Laptop />;
  if (/mac/i.test(name)) return <MiniPc />;
  return <Desktop />;
}

/** A part. `live` keeps it open; `loop` makes it open and close; otherwise it reacts to the pointer of its host. */
export function PartIso({ part, live = false, loop = false }: { part: DetectedPart; live?: boolean; loop?: boolean }) {
  const looping = useLoop(loop);
  return <span className={`iso-box ${loop || live ? "iso-host" : ""} ${live || looping ? "iso-live" : ""}`}>{partFigure(part)}</span>;
}

/** The whole device, opening and closing on its own. */
export function DeviceIso({ hardware }: { hardware: Hardware }) {
  const live = useLoop(true, 3000);
  return <span className={`iso-box iso-host ${live ? "iso-live" : ""}`}>{deviceFigure(hardware)}</span>;
}
