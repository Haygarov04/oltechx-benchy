import { useEffect, useRef, useState } from "react";
import type { DetectedPart, Hardware } from "../../shared/types";
import { deviceModel, type Model, partModel } from "../three/models";
import { LiveStage, picture } from "../three/stage";

const partKey = (part: DetectedPart) => `${part.slot}|${part.name}|${part.specs.kind ?? ""}|${part.specs.ddr ?? ""}|${part.specs.capacityGb ?? ""}|${part.specs.healthPct ?? ""}`;

/** A still 3D picture of a part, rendered once and kept. */
export function PartPicture({ part }: { part: DetectedPart }) {
  const key = partKey(part);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    picture(key, () => partModel(part)).then((url) => alive && setSrc(url), () => undefined);
    return () => {
      alive = false;
    };
  }, [key, part]);
  return src ? <img className="model-picture" src={src} alt={part.name} draggable={false} /> : <span className="model-loading" aria-hidden="true" />;
}

/** A live, animated 3D view: the whole device on the home screen, the part being tested during the check. */
export function LiveModel({ source, active = false, heat = 0, slow = false, label }: { source: { part: DetectedPart } | { hardware: Hardware }; active?: boolean; heat?: number; slow?: boolean; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<LiveStage | null>(null);
  const key = "part" in source ? partKey(source.part) : `device|${source.hardware.computerName}|${source.hardware.laptop}`;

  useEffect(() => {
    if (!canvas.current) return;
    let live: LiveStage;
    try {
      live = new LiveStage(canvas.current);
    } catch {
      return; // No WebGL: the page still works without the picture.
    }
    stage.current = live;
    return () => {
      live.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    let model: Model;
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive || !stage.current) return;
      model = "part" in source ? partModel(source.part) : deviceModel(source.hardware);
      stage.current.setModel(model);
    });
    return () => {
      alive = false;
    };
    // The key describes the source; rebuilding on every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    stage.current?.setState({ active, heat, slow });
  }, [active, heat, slow]);

  return <canvas ref={canvas} className="model-live" role="img" aria-label={label} />;
}

/** A still picture of any model, for the model gallery. */
export function ModelPicture({ id, build, label }: { id: string; build: () => Model; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    picture(`gallery|${id}`, build, 480, 360).then(setSrc, () => undefined);
  }, [id, build]);
  return src ? <img className="model-picture" src={src} alt={label} /> : <span className="model-loading" aria-hidden="true" />;
}
