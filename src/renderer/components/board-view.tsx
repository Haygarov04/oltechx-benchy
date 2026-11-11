import { useEffect, useRef } from "react";
import type { DetectedPart, PartSlot } from "../../shared/types";
import { type BoardKind, BoardScene } from "../three/board";

/** The parts on one board. Pick a part up and let it go; a short click opens it large. */
export function BoardView({ parts, active = null, heat = 0, paused = false, onSelect, label, kind = "laptop" }: { parts: DetectedPart[]; active?: PartSlot | null; heat?: number; paused?: boolean; onSelect?: (index: number) => void; label: string; kind?: BoardKind }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const key = `${kind}|${parts.map((p) => `${p.slot}:${p.name}`).join("|")}`;

  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive || !canvas.current) return;
      try {
        scene.current = new BoardScene(canvas.current, parts, (index) => select.current?.(index), kind);
        scene.current.setState({ active, heat, paused });
      } catch {
        // No WebGL: the list of parts below still shows everything.
      }
    });
    return () => {
      alive = false;
      scene.current?.dispose();
      scene.current = null;
    };
    // The key describes the parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    scene.current?.setState({ active, heat, paused });
  }, [active, heat, paused]);

  return <canvas ref={canvas} className="board-canvas" role="img" aria-label={label} />;
}
