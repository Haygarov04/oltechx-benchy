import type { CheckResults, DetectedPart, Hardware, PartSlot } from "../../shared/types";
import { show, stability } from "../format";
import { useLang } from "../i18n";
import { PartImage } from "./part-image";
import { Scope } from "./scope";

type Row = { label: string; value: string; bad?: boolean; good?: boolean };

function MetricCard({ part, title, rows, note, delay, chart }: { part: DetectedPart; title: string; rows: Row[]; note?: string; delay: number; chart?: { samples: number[]; label: string } }) {
  return (
    <div className="card metric-card rise render-host" style={{ animationDelay: `${delay}ms` }}>
      <div className="part-figure">
        <PartImage part={part} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="silk">{title}</div>
        <div className="part-name">{part.name}</div>
        <div className="metric-rows">
          {rows.map((row) => (
            <div key={row.label} className="metric-row" data-bad={row.bad} data-good={row.good}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
        {chart && chart.samples.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <div className="silk">{chart.label}</div>
            <Scope samples={chart.samples} slots={chart.samples.length} label={chart.label} />
          </div>
        )}
        {note && (
          <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

/** Every measured number, grouped by part, the same way the site shows them. */
export function Results({ results, hardware }: { results: CheckResults; hardware: Hardware }) {
  const { t, lang } = useLang();
  const part = (slot: PartSlot): DetectedPart => hardware.parts.find((p) => p.slot === slot) ?? { slot, name: t(`slot${slot[0].toUpperCase()}${slot.slice(1)}` as "slotCpu"), specs: {} };
  const errors = (n: number) => ({ label: t("m_errors"), value: n > 0 ? String(n) : t("noErrors"), bad: n > 0, good: n === 0 });
  const pct = (value: number | null) => (value === null ? null : Math.round(value * 100));
  const { cpu, gpu, vram, ram, disk, temps } = results;
  const cpuHold = pct(stability(cpu.samples));
  const gpuHold = pct(stability(gpu.samples));

  const cpuRows: Row[] = [
    { label: t("m_single"), value: show(cpu.single, "ops", lang) },
    { label: t("m_multi"), value: show(cpu.multi, "ops", lang) },
    ...(cpu.float ? [{ label: t("m_float"), value: show(cpu.float.multi, "flops", lang) }] : []),
    ...(cpu.hash ? [{ label: t("m_hash"), value: show(cpu.hash, "bytes", lang) }] : []),
    ...(cpu.compress ? [{ label: t("m_compress"), value: show(cpu.compress, "bytes", lang) }] : []),
    ...(cpuHold !== null ? [{ label: t("m_sustained"), value: t("ofPeak", { n: cpuHold }), bad: cpuHold < 75, good: cpuHold >= 90 }] : []),
    ...(temps?.cpuMax ? [{ label: t("m_temp"), value: `${temps.cpuMax} °C`, bad: temps.cpuMax >= 95 }] : []),
    errors(cpu.errors + (cpu.float?.errors ?? 0)),
  ];

  const cards = [
    <MetricCard key="cpu" part={part("cpu")} title={t("slotCpu")} rows={cpuRows} delay={0} chart={{ samples: cpu.samples ?? [], label: t("liveChartCpu") }} />,
    ram && (
      <MetricCard
        key="ram"
        part={part("ram")}
        title={t("slotRam")}
        delay={70}
        rows={[
          { label: t("m_bandwidth"), value: show(ram.bandwidth, "bytes", lang) },
          { label: t("m_latency"), value: show(ram.latencyNs, "ns", lang) },
          { label: t("m_verified"), value: show(ram.testedMb, "mb", lang) },
          errors(ram.errors),
        ]}
      />
    ),
    <MetricCard
      key="gpu"
      part={part("gpu")}
      title={t("slotGpu")}
      delay={140}
      note={gpu.reason}
      chart={gpu.tested && !gpu.reason ? { samples: gpu.samples, label: t("liveChartGpu") } : undefined}
      rows={
        gpu.tested && !gpu.reason
          ? [
              { label: t("m_gpuInt"), value: show(gpu.opsPerSec, "ops", lang) },
              ...(gpu.flops ? [{ label: t("m_fp32"), value: show(gpu.flops, "flops", lang) }] : []),
              ...(gpu.bandwidth ? [{ label: t("m_bandwidth"), value: show(gpu.bandwidth, "bytes", lang) }] : []),
              ...(vram.tested ? [{ label: t("m_vram"), value: show(vram.testedMb, "mb", lang) }] : []),
              ...(gpuHold !== null ? [{ label: t("m_sustained"), value: t("ofPeak", { n: gpuHold }), bad: gpuHold < 80, good: gpuHold >= 90 }] : []),
              ...(temps?.gpuMax ? [{ label: t("m_temp"), value: `${temps.gpuMax} °C`, bad: temps.gpuMax >= 90 }] : []),
              errors(gpu.errors + vram.errors),
            ]
          : []
      }
    />,
    disk && (
      <MetricCard
        key="disk"
        part={part("storage")}
        title={t("slotStorage")}
        delay={210}
        note={disk.reason}
        rows={disk.tested ? [{ label: t("m_write"), value: show(disk.write, "bytes", lang) }, { label: t("m_iops"), value: show(disk.iops, "iops", lang) }] : []}
      />
    ),
  ];
  return <div className="metrics">{cards}</div>;
}
