import type { CheckResults, DiskResults } from "../../shared/types";
import { bandwidthTest, flopsTest, gpuStress, memoryTest, requestAdapter } from "./gpu";
import { intUnit, matmulUnit } from "./kernels";
import { perSecond, runJob, stopped } from "./workers";

/**
 * The whole check, stage by stage. Each stage measures real performance and verifies every result.
 * The interface shows the stages in this order. The numbers go to the server, which decides pass or fail.
 */

export type StageId = "cpu" | "float" | "crypto" | "ram" | "gpu" | "gpuMath" | "vram" | "disk";
export const STAGES: StageId[] = ["cpu", "float", "crypto", "ram", "gpu", "gpuMath", "vram", "disk"];

/** The results so far: each stage fills in its part. */
export type Draft = {
  cpu?: Partial<CheckResults["cpu"]>;
  gpu?: Partial<CheckResults["gpu"]>;
  vram?: CheckResults["vram"];
  ram?: Partial<NonNullable<CheckResults["ram"]>>;
  disk?: DiskResults;
};

export type Progress = {
  stage: StageId;
  /** From 0 to 1 for the whole check. */
  overall: number;
  /** The value being measured right now and its unit. */
  live: number | null;
  unit: "ops" | "flops" | "bytes" | "mb" | null;
  /** Second by second, for the chart: processor in the cpu stage, graphics in the gpu stage. */
  samples: number[];
  /** Stages that will not run on this machine, for example without a graphics test. */
  skipped: StageId[];
  results: Draft;
};

export type CheckOptions = {
  /** How much graphics memory and RAM to fill and verify. */
  vramTargetMb: number;
  ramTestMb: number;
  /** The drive test runs outside the interface (in the main process on a PC, natively on a phone). */
  disk?: () => Promise<DiskResults>;
  temps?: () => Promise<{ cpu: number | null; gpu: number | null }>;
};

const INT_N = 100_000;
const FLOAT_N = 64;
const SEEDS = Array.from({ length: 8 }, (_, i) => ((i + 1) * 2654435761) | 0);

/** Text-like data: compresses about as well as real files do. */
function textLike(bytes: number) {
  const words = ["oltechx", "процесор", "graphics", "memory", "0x1f", "проверка", "benchmark", " ", "\n", "2026", "data", "stream"];
  const out = new Uint8Array(bytes);
  const encoder = new TextEncoder();
  let x = 0x1234567;
  for (let i = 0; i < bytes; ) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const word = encoder.encode(words[(x >>> 0) % words.length]);
    out.set(word.subarray(0, bytes - i), i);
    i += word.length;
  }
  return out;
}

export async function runCheck(signal: AbortSignal, onProgress: (p: Progress) => void, options: CheckOptions): Promise<CheckResults> {
  const started = performance.now();
  let hiddenMs = 0;
  let hiddenSince: number | null = document.hidden ? performance.now() : null;
  const onVisibility = () => {
    if (document.hidden) hiddenSince = performance.now();
    else if (hiddenSince !== null) {
      hiddenMs += performance.now() - hiddenSince;
      hiddenSince = null;
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const adapter = await requestAdapter();
  let gpuDevice: GPUDevice | null = null;
  let lost: string | null = null;
  if (adapter) {
    try {
      gpuDevice = await adapter.requestDevice({
        requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize },
      });
      gpuDevice.lost.then((info) => {
        if (info.reason !== "destroyed") lost = info.message || "Видеокартата спря да отговаря.";
      });
    } catch {
      gpuDevice = null;
    }
  }

  // Planned time of every stage, for the progress bar. Without a graphics test the processor runs longer.
  const threads = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 64));
  const memoryWorkers = Math.min(threads, 8);
  const ms = {
    single: 5000,
    multi: gpuDevice ? 20_000 : 30_000,
    floatSingle: 3000,
    floatMulti: 6000,
    hash: 4000,
    compress: 4000,
    copy: 3000,
    chase: 2500,
    memtest: Math.max(2000, options.ramTestMb * 1.2),
    gpuWarm: gpuDevice ? 5000 : 0,
    gpu: gpuDevice ? 20_000 : 0,
    flops: gpuDevice ? 6000 : 0,
    bandwidth: gpuDevice ? 3000 : 0,
    vram: gpuDevice ? Math.max(4000, options.vramTargetMb * 2.5) : 0,
    disk: options.disk ? 9000 : 0,
  };
  const total = Object.values(ms).reduce((a, b) => a + b, 0) + 3000;

  const skipped: StageId[] = [...(gpuDevice ? [] : (["gpu", "gpuMath", "vram"] as StageId[])), ...(options.disk ? [] : (["disk"] as StageId[]))];
  const state: Progress = { stage: "cpu", overall: 0, live: null, unit: null, samples: [], skipped, results: {} };
  let lastSample = 0;
  const emit = (patch: Partial<Progress> = {}) => {
    // A new stage starts a new chart. The processor and graphics stress send their own per-second samples.
    if (patch.stage && patch.stage !== state.stage) state.samples = [];
    if (patch.live && !patch.samples && performance.now() - lastSample > 250 && state.stage !== "cpu" && state.stage !== "gpu") {
      lastSample = performance.now();
      state.samples = [...state.samples, patch.live].slice(-80);
    }
    Object.assign(state, patch);
    state.overall = Math.min(0.99, (performance.now() - started) / total);
    onProgress({ ...state, results: { ...state.results } });
  };
  const ticker = setInterval(() => emit(), 400);

  // Temperatures every few seconds, where the system reports them.
  const temps = { cpuMax: null as number | null, gpuMax: null as number | null };
  const readTemps = async () => {
    const now = await options.temps?.().catch(() => null);
    if (now?.cpu) temps.cpuMax = Math.max(temps.cpuMax ?? 0, now.cpu);
    if (now?.gpu) temps.gpuMax = Math.max(temps.gpuMax ?? 0, now.gpu);
  };
  const tempTimer = options.temps ? setInterval(() => void readTemps(), 3000) : null;

  try {
    // ── Processor: integer work on one core, then on all cores second by second ──
    emit({ stage: "cpu", live: null, unit: "ops", samples: [] });
    const intJob = { kind: "int", n: INT_N, seeds: SEEDS, expected: SEEDS.map((s) => intUnit(s, INT_N)) };
    const single = await runJob({ ...intJob, durationMs: ms.single }, 1, signal, (rate) => emit({ live: rate }));
    const seconds = perSecond();
    const multiStart = performance.now();
    const multi = await runJob({ ...intJob, durationMs: ms.multi }, threads, signal, (rate, reports) => {
      const work = reports.reduce((s, r) => s + r.work, 0);
      if (seconds.add(work, performance.now() - multiStart)) emit({ live: rate, samples: [...seconds.samples] });
    });
    const cpu: CheckResults["cpu"] = {
      threads,
      single: single.rate,
      multi: multi.rate,
      checked: single.reports.reduce((s, r) => s + r.work, 0) / (INT_N * 7) + multi.work / (INT_N * 7),
      errors: single.errors + multi.errors,
      samples: seconds.samples.slice(0, 120),
    };
    cpu.checked = Math.round(cpu.checked);
    emit({ results: { ...state.results, cpu } });

    // ── Processor: floating point (matrix multiply) ──
    emit({ stage: "float", live: null, unit: "flops", samples: [] });
    const floatJob = { kind: "float", n: FLOAT_N, seeds: SEEDS, expected: (() => {
      const size = FLOAT_N * FLOAT_N;
      const [a, b, c] = [new Float64Array(size), new Float64Array(size), new Float64Array(size)];
      return SEEDS.map((s) => matmulUnit(s, FLOAT_N, a, b, c));
    })() };
    const floatSingle = await runJob({ ...floatJob, durationMs: ms.floatSingle }, 1, signal, (rate) => emit({ live: rate }));
    const floatMulti = await runJob({ ...floatJob, durationMs: ms.floatMulti }, threads, signal, (rate) => emit({ live: rate }));
    cpu.float = { single: floatSingle.rate, multi: floatMulti.rate, errors: floatSingle.errors + floatMulti.errors };
    emit({ results: { ...state.results, cpu: { ...cpu } } });

    // ── Processor: encryption and compression, the way real programs use them ──
    emit({ stage: "crypto", live: null, unit: "bytes" });
    if (crypto?.subtle) {
      const data = textLike(4 * 1024 * 1024).buffer;
      const expected = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))];
      const hash = await runJob({ kind: "hash", durationMs: ms.hash, data, expected }, threads, signal, (rate) => emit({ live: rate }));
      cpu.hash = hash.rate;
      cpu.errors += hash.errors;
    }
    if (typeof CompressionStream === "function") {
      const data = textLike(2 * 1024 * 1024);
      const packed = await runJob({ kind: "compress", durationMs: ms.compress, data }, threads, signal, (rate) => emit({ live: rate }));
      cpu.compress = packed.rate;
      cpu.errors += packed.errors;
    }
    emit({ results: { ...state.results, cpu: { ...cpu } } });

    // ── RAM: bandwidth, latency, then a pattern test that reads back every cell ──
    emit({ stage: "ram", live: null, unit: "bytes" });
    const copy = await runJob({ kind: "copy", durationMs: ms.copy, bytes: 48 * 1024 * 1024 }, memoryWorkers, signal, (rate) => emit({ live: rate }));
    emit({ results: { ...state.results, ram: { bandwidth: copy.rate } } });
    const chase = await runJob({ kind: "chase", durationMs: ms.chase, entries: 32 * 1024 * 1024 }, 1, signal);
    const latencyNs = chase.reports[0]?.ns ?? 0;
    emit({ results: { ...state.results, ram: { bandwidth: copy.rate, latencyNs } } });
    const perWorker = Math.max(64, Math.floor(options.ramTestMb / memoryWorkers / 64) * 64);
    const memtest = await runJob(
      { kind: "memtest", mb: perWorker, chunkMb: 64, seed: 0x5eed },
      memoryWorkers,
      signal,
      (_rate, reports) => emit({ live: reports.reduce((s, r) => s + (r.mb ?? 0), 0), unit: "mb" }),
    );
    const ram = {
      bandwidth: copy.rate,
      latencyNs,
      testedMb: memtest.reports.reduce((s, r) => s + (r.testedMb ?? 0), 0),
      errors: memtest.errors + copy.errors,
    };
    emit({ results: { ...state.results, ram } });

    // ── Graphics card: integer stress, FP32, memory bandwidth and graphics memory ──
    let gpu: CheckResults["gpu"] = {
      tested: false,
      reason: adapter ? "Видеокартата не позволи тест." : "Драйверът на видеокартата не поддържа теста. Обнови драйвера.",
      opsPerSec: 0,
      samples: [],
      checked: 0,
      errors: 0,
    };
    let vram: CheckResults["vram"] = { tested: false, reason: gpu.reason, testedMb: 0, errors: 0 };
    if (gpuDevice && adapter) {
      try {
        emit({ stage: "gpu", live: null, unit: "ops", samples: [] });
        const stress = await gpuStress(gpuDevice, ms.gpu, signal, (samples) => emit({ live: samples.at(-1) ?? null, samples }));
        gpu = { tested: true, ...stress };
        emit({ results: { ...state.results, gpu: { ...gpu } } });

        emit({ stage: "gpuMath", live: null, unit: "flops", samples: [] });
        const flops = await flopsTest(gpuDevice, ms.flops, signal, (rate) => emit({ live: rate }));
        gpu.flops = flops.flops;
        gpu.errors += flops.errors;
        gpu.checked += flops.checked;
        emit({ results: { ...state.results, gpu: { ...gpu } } });
        const band = await bandwidthTest(gpuDevice, adapter, ms.bandwidth, signal, (rate) => emit({ live: rate, unit: "bytes" }));
        gpu.bandwidth = band.bandwidth;
        gpu.errors += band.errors;
        emit({ results: { ...state.results, gpu: { ...gpu } } });

        emit({ stage: "vram", live: 0, unit: "mb" });
        vram = await memoryTest(gpuDevice, adapter, options.vramTargetMb, signal, (mb) => emit({ live: mb }));
        emit({ results: { ...state.results, vram } });
      } catch (error) {
        if (signal.aborted) throw error;
        const reason = lost ?? "Видеокартата спря да отговаря по време на теста.";
        gpu = { ...gpu, tested: true, reason };
        vram = { ...vram, reason: vram.reason ?? reason };
      } finally {
        gpuDevice.destroy();
      }
    }

    // ── System drive ──
    let disk: DiskResults | undefined;
    if (options.disk) {
      emit({ stage: "disk", live: null, unit: null, samples: [] });
      disk = await options.disk().catch(() => ({ tested: false, reason: "Тестът на диска не успя.", write: 0, iops: 0, testedMb: 0 }));
      if (signal.aborted) throw stopped();
      emit({ results: { ...state.results, disk } });
    }

    await readTemps();
    onVisibility();
    return { cpu, gpu, vram, ram, disk, temps, hiddenMs: Math.round(hiddenMs), durationMs: Math.round(performance.now() - started) };
  } finally {
    clearInterval(ticker);
    if (tempTimer) clearInterval(tempTimer);
    document.removeEventListener("visibilitychange", onVisibility);
  }
}
