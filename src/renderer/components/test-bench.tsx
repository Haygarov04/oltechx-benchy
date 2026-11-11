import { ActivityIcon, CheckIcon, CpuIcon, GaugeIcon, HardDriveIcon, LayersIcon, LockKeyholeIcon, MemoryStickIcon, SigmaIcon } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { DetectedPart, Hardware, PartSlot } from "../../shared/types";
import { type Progress, STAGES, type StageId } from "../engine";
import { measure, show } from "../format";
import { useLang } from "../i18n";
import { BoardView } from "./board-view";
import { Gauge } from "./gauge";
import { Scope } from "./scope";

export const STAGE_META: Record<StageId, { Icon: typeof CpuIcon; slot: PartSlot }> = {
  cpu: { Icon: CpuIcon, slot: "cpu" },
  float: { Icon: SigmaIcon, slot: "cpu" },
  crypto: { Icon: LockKeyholeIcon, slot: "cpu" },
  ram: { Icon: MemoryStickIcon, slot: "ram" },
  gpu: { Icon: GaugeIcon, slot: "gpu" },
  gpuMath: { Icon: ActivityIcon, slot: "gpu" },
  vram: { Icon: LayersIcon, slot: "gpu" },
  disk: { Icon: HardDriveIcon, slot: "storage" },
};

/** The finished value of a stage, for the list on the right. */
function stageResult(stage: StageId, results: Progress["results"], lang: "bg" | "en"): string | null {
  const { cpu, gpu, ram, vram, disk } = results;
  switch (stage) {
    case "cpu":
      return cpu?.multi ? show(cpu.multi, "ops", lang) : null;
    case "float":
      return cpu?.float ? show(cpu.float.multi, "flops", lang) : null;
    case "crypto":
      return cpu?.hash ? show(cpu.hash, "bytes", lang) : cpu?.compress ? show(cpu.compress, "bytes", lang) : null;
    case "ram":
      return ram?.testedMb ? `${show(ram.bandwidth ?? 0, "bytes", lang)} · ${show(ram.latencyNs ?? 0, "ns", lang)}` : null;
    case "gpu":
      return gpu?.opsPerSec ? show(gpu.opsPerSec, "ops", lang) : null;
    case "gpuMath":
      return gpu?.bandwidth ? `${show(gpu.flops ?? 0, "flops", lang)} · ${show(gpu.bandwidth, "bytes", lang)}` : null;
    case "vram":
      return vram?.tested ? show(vram.testedMb, "mb", lang) : null;
    case "disk":
      return disk?.tested ? show(disk.write, "bytes", lang) : null;
  }
}

/** The part the current stage loads, for the big drawing. */
function stagePart(hardware: Hardware, slot: PartSlot): DetectedPart {
  return hardware.parts.find((p) => p.slot === slot) ?? { slot, name: "", specs: {} };
}

export function TestBench({ progress, startedAt, hardware }: { progress: Progress; startedAt: number; hardware: Hardware }) {
  const { t, lang } = useLang();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  // The dial's scale: the highest value seen in this stage and unit, plus room to grow.
  const peak = useRef<{ key: string; max: number }>({ key: "", max: 1 });
  const key = `${progress.stage}-${progress.unit}`;
  if (peak.current.key !== key) peak.current = { key, max: 1 };
  if (progress.live && progress.live * 1.25 > peak.current.max) peak.current.max = progress.live * 1.25;
  const fraction = progress.live ? progress.live / peak.current.max : 0;
  const reading = progress.live && progress.unit ? measure(progress.live, progress.unit, lang) : { value: "…", unit: t("running") };

  const current = STAGES.indexOf(progress.stage);
  const elapsed = (now - startedAt) / 1000;
  // The countdown only goes down: a new estimate that is higher is ignored, so it never steps back.
  const estimate = progress.overall > 0.04 ? Math.max(1, Math.round((elapsed * (1 - progress.overall)) / progress.overall)) : null;
  const shown = useRef<number | null>(null);
  if (estimate !== null) shown.current = shown.current === null ? estimate : Math.min(shown.current, estimate);
  const remaining = shown.current;
  const meta = STAGE_META[progress.stage];
  const chart = progress.samples.length > 1;

  return (
    <div className="bench">
      <section className="card stage-panel rise">
        <div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="silk">
              {t("check")} · {current + 1} / {STAGES.length}
            </div>
            <div className="mono muted" style={{ fontSize: 13 }}>
              {remaining ? t("remaining", { s: remaining }) : t("starting")}
            </div>
          </div>
          <h1 className="display h2" style={{ margin: "8px 0 10px" }}>
            {t(`stage_${progress.stage}`)}
          </h1>
          <span className="meter" role="progressbar" aria-valuenow={Math.round(progress.overall * 100)} style={{ "--fill": `${Math.round(progress.overall * 100)}%` } as CSSProperties} />
        </div>
        <div className="bench-board">
          <BoardView parts={hardware.parts} active={meta.slot} heat={Math.min(1, progress.overall * 2 + 0.3)} paused={meta.slot === "gpu" || meta.slot === "ram"} label={t(`stage_${progress.stage}`)} />
        </div>
        <div className="readout">
          <Gauge fraction={fraction} value={reading.value} unit={reading.unit} label={t(`stage_${progress.stage}`)} />
          <div className="readout-chart">
            <div className="row silk" style={{ justifyContent: "space-between" }}>
              <span>{t(`note_${progress.stage}`)}</span>
              {chart && <span>{progress.samples.length}</span>}
            </div>
            <Scope samples={progress.samples} slots={24} live label={t(`stage_${progress.stage}`)} />
            <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
              {t("dontClose")}
            </p>
          </div>
        </div>
      </section>

      <section className="card rise" style={{ animationDelay: "80ms" }}>
        <ol className="stages">
          {STAGES.map((stage, i) => {
            const { Icon } = STAGE_META[stage];
            const state = progress.skipped.includes(stage) ? "skipped" : i < current ? "done" : i === current ? "active" : "pending";
            const value = stageResult(stage, progress.results, lang);
            return (
              <li key={stage} className="stage" data-state={state}>
                <span className="stage-icon">{state === "done" ? <CheckIcon aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="stage-name" style={{ display: "block" }}>
                    {t(`stage_${stage}`)}
                  </span>
                  <span className="stage-note" style={{ display: "block" }}>
                    {t(`note_${stage}`)}
                  </span>
                </span>
                <span className="stage-value">
                  {state === "skipped" ? t("skipped") : state === "active" ? (value ?? t("running")) : state === "done" ? (value ?? "✓") : t("waiting")}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
