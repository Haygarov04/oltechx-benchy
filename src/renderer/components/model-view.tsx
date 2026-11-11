import { useEffect, useRef, useState } from "react";
import type { DetectedPart, Hardware } from "../../shared/types";
import { deviceModel, type Model, partModel } from "../three/models";
import { LiveStage, picture, turntable } from "../three/stage";

const partKey = (part: DetectedPart) => `${part.slot}|${part.name}|${part.specs.kind ?? ""}|${part.specs.ddr ?? ""}|${part.specs.capacityGb ?? ""}|${part.specs.healthPct ?? ""}`;

/** A part slowly turning in its card. */
export function PartPicture({ part }: { part: DetectedPart }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = partKey(part);
  useEffect(() => {
    let remove = () => {};
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive || !canvas.current) return;
      try {
        remove = turntable(canvas.current, () => partModel(part));
      } catch {
        // No WebGL: the card works without the picture.
      }
    });
    return () => {
      alive = false;
      remove();
    };
    // The key describes the part.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={canvas} className="model-turn" role="img" aria-label={part.name} />;
}

/** A live 3D view that can be turned by dragging: the whole device, the part being tested, or a part opened large. */
export function LiveModel({ source, active = false, heat = 0, slow = false, label }: { source: { part: DetectedPart } | { hardware: Hardware }; active?: boolean; heat?: number; slow?: boolean; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<LiveStage | null>(null);
  const pointer = useRef<{ x: number; time: number; speed: number } | null>(null);
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

  return (
    <canvas
      ref={canvas}
      className="model-live"
      role="img"
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = { x: event.clientX, time: event.timeStamp, speed: 0 };
      }}
      onPointerMove={(event) => {
        const last = pointer.current;
        if (!last) return;
        const dx = event.clientX - last.x;
        const dt = Math.max(1, event.timeStamp - last.time) / 1000;
        pointer.current = { x: event.clientX, time: event.timeStamp, speed: dx / dt };
        stage.current?.drag(dx);
      }}
      onPointerUp={() => {
        if (pointer.current) stage.current?.drag(0, pointer.current.speed);
        pointer.current = null;
      }}
      onPointerCancel={() => (pointer.current = null)}
    />
  );
}

/** A still picture of any model, for the model gallery. */
export function ModelPicture({ id, build, label }: { id: string; build: () => Model; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    picture(`gallery|${id}`, build, 480, 360).then(setSrc, () => undefined);
  }, [id, build]);
  return src ? <img className="model-picture" src={src} alt={label} /> : <span className="model-loading" aria-hidden="true" />;
}
