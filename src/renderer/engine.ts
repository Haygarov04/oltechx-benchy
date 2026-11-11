/// <reference types="@webgpu/types" />
import type { CheckResults } from "../shared/types";

/**
 * The stress test. Every calculation has a known correct answer, so a wrong result means unstable
 * hardware, not just slow hardware. The numbers go to the server, which decides pass or fail.
 * Failure reasons stay in Bulgarian because the OLTechX site shows them to buyers.
 */

export type Phase = "cpu" | "gpu" | "vram";

export type Progress = {
  phase: Phase;
  /** From 0 to 1 for the whole test. */
  overall: number;
  cpuRate?: number;
  gpuSamples?: number[];
  vramMb?: number;
  vramTarget?: number;
};

const MB = 1024 * 1024;

async function requestAdapter(): Promise<GPUAdapter | null> {
  try {
    return (await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" })) ?? null;
  } catch {
    return null;
  }
}

// ── Processor ───────────────────────────────────────────────────────────────

const CPU_N = 100_000;
const CPU_OPS = CPU_N * 7;

/** The same calculation as in the workers. The answer is known in advance. */
function cpuUnit(seed: number, n: number) {
  let x = seed | 0;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x = (Math.imul(x, 1664525) + 1013904223) | 0;
  }
  return x;
}

const WORKER = `
function unit(seed, n) {
  let x = seed | 0;
  for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x = (Math.imul(x, 1664525) + 1013904223) | 0; }
  return x;
}
onmessage = (event) => {
  const { seeds, expected, n, durationMs } = event.data;
  const start = performance.now();
  const end = start + durationMs;
  let units = 0, errors = 0, last = start;
  for (;;) {
    const now = performance.now();
    if (now >= end) break;
    const k = units % seeds.length;
    if (unit(seeds[k], n) !== expected[k]) errors++;
    units++;
    if (now - last > 250) { postMessage({ done: false, units, errors, ms: now - start }); last = now; }
  }
  postMessage({ done: true, units, errors, ms: performance.now() - start });
};`;

type WorkerTotals = { rate: number; units: number; errors: number };

function runWorkers(count: number, durationMs: number, signal: AbortSignal, onRate: (rate: number) => void): Promise<WorkerTotals> {
  const seeds = Array.from({ length: 8 }, (_, i) => (i + 1) * 2654435761);
  const expected = seeds.map((s) => cpuUnit(s, CPU_N));
  const url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
  const state = Array.from({ length: count }, () => ({ units: 0, errors: 0, ms: 1, done: false }));
  const workers = state.map(() => new Worker(url));
  const rate = () => state.reduce((sum, s) => sum + (s.units * CPU_OPS) / (s.ms / 1000), 0);
  return new Promise((resolve, reject) => {
    const stop = () => {
      workers.forEach((w) => w.terminate());
      URL.revokeObjectURL(url);
    };
    signal.addEventListener("abort", () => {
      stop();
      reject(new DOMException("Stopped", "AbortError"));
    });
    workers.forEach((worker, i) => {
      worker.onerror = () => {
        stop();
        reject(new Error("The processor test stopped."));
      };
      worker.onmessage = (event: MessageEvent<{ done: boolean; units: number; errors: number; ms: number }>) => {
        Object.assign(state[i], event.data);
        onRate(rate());
        if (state.every((s) => s.done)) {
          stop();
          resolve({ rate: rate(), units: state.reduce((s, x) => s + x.units, 0), errors: state.reduce((s, x) => s + x.errors, 0) });
        }
      };
      worker.postMessage({ seeds, expected, n: CPU_N, durationMs });
    });
  });
}

// ── Graphics card ────────────────────────────────────────────────────────────

const GROUPS = 1024;
const INVOCATIONS = GROUPS * 256;
const GPU_OPS_PER_STEP = 8;
const TARGET_DISPATCH_MS = 25;

const STRESS = /* wgsl */ `
struct Params { iterations: u32, seed: u32 };
@group(0) @binding(0) var<storage, read_write> out: array<u32>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  var x = (id.x ^ params.seed) * 747796405u + 2891336453u;
  for (var i = 0u; i < params.iterations; i++) {
    x ^= x << 13u;
    x ^= x >> 17u;
    x ^= x << 5u;
    x = x * 1664525u + 1013904223u;
  }
  out[id.x] = x;
}`;

/** The correct answer for one cell, computed on the processor. */
function gpuReference(index: number, seed: number, iterations: number) {
  let x = (Math.imul((index ^ seed) >>> 0, 747796405) + 2891336453) >>> 0;
  for (let i = 0; i < iterations; i++) {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  }
  return x;
}

async function gpuStress(device: GPUDevice, durationMs: number, signal: AbortSignal, onSamples: (samples: number[]) => void) {
  const shader = device.createShaderModule({ code: STRESS });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint: "main" } });
  const out = device.createBuffer({ size: INVOCATIONS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const read = device.createBuffer({ size: INVOCATIONS * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const params = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: out } },
      { binding: 1, resource: { buffer: params } },
    ],
  });

  const dispatch = async (iterations: number, seed: number, copy: boolean) => {
    device.queue.writeBuffer(params, 0, new Uint32Array([iterations, seed]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(GROUPS);
    pass.end();
    if (copy) encoder.copyBufferToBuffer(out, 0, read, 0, INVOCATIONS * 4);
    const started = performance.now();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    return performance.now() - started;
  };

  // How much work per dispatch so it takes about 25 ms: enough load without freezing the system.
  let iterations = 32;
  for (let i = 0; i < 5; i++) {
    const ms = await dispatch(iterations, 1, false);
    iterations = Math.min(1 << 17, Math.max(16, Math.round((iterations * TARGET_DISPATCH_MS) / Math.max(ms, 0.25))));
  }

  // Warm-up: the card raises its clocks over a few seconds. This time is not counted.
  const warm = performance.now() + 5000;
  while (performance.now() < warm) {
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    await dispatch(iterations, 7, false);
  }

  const samples: number[] = [];
  let windowOps = 0;
  let windowMs = 0;
  let totalOps = 0;
  let totalMs = 0;
  let checked = 0;
  let errors = 0;
  let lastCheck = 0;
  const end = performance.now() + durationMs;
  while (performance.now() < end) {
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    const verify = performance.now() - lastCheck > 1000;
    const seed = (Math.random() * 4294967296) >>> 0;
    const ms = await dispatch(iterations, seed, verify);
    const ops = INVOCATIONS * iterations * GPU_OPS_PER_STEP;
    windowOps += ops;
    windowMs += ms;
    totalOps += ops;
    totalMs += ms;
    if (windowMs >= 1000) {
      samples.push(windowOps / (windowMs / 1000));
      windowOps = 0;
      windowMs = 0;
      onSamples([...samples]);
    }
    if (verify) {
      lastCheck = performance.now();
      await read.mapAsync(GPUMapMode.READ);
      const values = new Uint32Array(read.getMappedRange().slice(0));
      read.unmap();
      for (let k = 0; k < 48; k++) {
        const index = Math.floor(Math.random() * INVOCATIONS);
        if (values[index] !== gpuReference(index, seed, iterations)) errors++;
      }
      checked++;
    }
  }
  out.destroy();
  read.destroy();
  params.destroy();
  // The median of the seconds is steadier than the mean: one slow moment does not drag the result down.
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted.length ? sorted[sorted.length >> 1] : totalMs > 0 ? totalOps / (totalMs / 1000) : 0;
  return { opsPerSec: median, samples, checked, errors };
}

const MEMORY = /* wgsl */ `
struct Params { seed: u32, count: u32, invert: u32, pad: u32 };
@group(0) @binding(0) var<storage, read_write> buf: array<u32>;
@group(0) @binding(1) var<storage, read_write> bad: array<atomic<u32>, 1>;
@group(0) @binding(2) var<uniform> params: Params;
const THREADS: u32 = 1048576u;

fn pattern(i: u32) -> u32 {
  var x = (i ^ params.seed) * 747796405u + 2891336453u;
  x ^= x >> 16u;
  x = x * 2654435769u;
  return select(x, ~x, params.invert == 1u);
}

@compute @workgroup_size(256)
fn fill(@builtin(global_invocation_id) id: vec3<u32>) {
  for (var i = id.x; i < params.count; i += THREADS) { buf[i] = pattern(i); }
}

@compute @workgroup_size(256)
fn verify(@builtin(global_invocation_id) id: vec3<u32>) {
  var wrong = 0u;
  for (var i = id.x; i < params.count; i += THREADS) {
    if (buf[i] != pattern(i)) { wrong++; }
  }
  if (wrong > 0u) { atomicAdd(&bad[0], wrong); }
}`;

/** Writes a pattern into graphics memory and verifies every cell. Twice, with inverted bits. */
async function memoryTest(device: GPUDevice, adapter: GPUAdapter, targetMb: number, signal: AbortSignal, onMb: (mb: number) => void) {
  const chunkBytes = Math.floor(Math.min(256 * MB, adapter.limits.maxStorageBufferBindingSize, adapter.limits.maxBufferSize) / 4) * 4;
  const chunkMb = chunkBytes / MB;
  const buffers: GPUBuffer[] = [];
  for (let mb = 0; mb + chunkMb <= targetMb; mb += chunkMb) {
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("validation");
    const buffer = device.createBuffer({ size: chunkBytes, usage: GPUBufferUsage.STORAGE });
    const invalid = await device.popErrorScope();
    const full = await device.popErrorScope();
    if (invalid || full) {
      buffer.destroy();
      break;
    }
    buffers.push(buffer);
  }
  if (buffers.length === 0) return { tested: false, reason: "Не стигна памет за теста.", testedMb: 0, errors: 0 };

  const shader = device.createShaderModule({ code: MEMORY });
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const fill = device.createComputePipeline({ layout: pipelineLayout, compute: { module: shader, entryPoint: "fill" } });
  const verify = device.createComputePipeline({ layout: pipelineLayout, compute: { module: shader, entryPoint: "verify" } });
  const bad = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const read = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  let done = 0;
  for (const invert of [0, 1]) {
    for (let i = 0; i < buffers.length; i++) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      device.queue.writeBuffer(params, 0, new Uint32Array([0x9e3779b9 ^ (i * 7919), chunkBytes / 4, invert, 0]));
      const group = device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: buffers[i] } },
          { binding: 1, resource: { buffer: bad } },
          { binding: 2, resource: { buffer: params } },
        ],
      });
      const encoder = device.createCommandEncoder();
      for (const pipeline of [fill, verify]) {
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(4096);
        pass.end();
      }
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      done++;
      onMb((done / 2) * chunkMb);
    }
  }
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(bad, 0, read, 0, 4);
  device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const errors = new Uint32Array(read.getMappedRange().slice(0))[0];
  read.unmap();
  [...buffers, bad, read, params].forEach((b) => b.destroy());
  return { tested: true, testedMb: buffers.length * chunkMb, errors };
}

// ── The whole test ───────────────────────────────────────────────────────────

const NO_GPU = { tested: false, opsPerSec: 0, samples: [] as number[], checked: 0, errors: 0 };

/** The whole test. vramTargetMb is how much graphics memory to verify. */
export async function runCheck(signal: AbortSignal, onProgress: (p: Progress) => void, vramTargetMb: number): Promise<CheckResults> {
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
  try {
    onProgress({ phase: "cpu", overall: 0 });
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

    // The app has time: longer stages give steadier numbers. The graphics warm-up is 5 seconds.
    const singleMs = 6000;
    const multiMs = gpuDevice ? 15_000 : 40_000;
    const gpuMs = gpuDevice ? 30_000 : 0;
    const memoryMs = gpuDevice ? Math.max(4000, vramTargetMb * 3) : 0;
    const total = singleMs + multiMs + (gpuDevice ? 5000 : 0) + gpuMs + memoryMs;
    const at = (ms: number) => Math.min(1, ms / total);

    const threads = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 64));
    const single = await runWorkers(1, singleMs, signal, (rate) => onProgress({ phase: "cpu", overall: at(0), cpuRate: rate }));
    const multi = await runWorkers(threads, multiMs, signal, (rate) => onProgress({ phase: "cpu", overall: at(singleMs), cpuRate: rate }));
    const cpu = { threads, single: single.rate, multi: multi.rate, checked: single.units + multi.units, errors: single.errors + multi.errors };

    let gpu: CheckResults["gpu"] = { ...NO_GPU, reason: adapter ? "Видеокартата не позволи тест." : "Драйверът на видеокартата не поддържа теста. Обнови драйвера." };
    let vram: CheckResults["vram"] = { tested: false, reason: gpu.reason, testedMb: 0, errors: 0 };
    if (gpuDevice) {
      const base = singleMs + multiMs + 5000;
      try {
        const stress = await gpuStress(gpuDevice, gpuMs, signal, (samples) =>
          onProgress({ phase: "gpu", overall: at(base + samples.length * 1000), gpuSamples: samples }),
        );
        gpu = { tested: true, ...stress };
        const target = vramTargetMb;
        onProgress({ phase: "vram", overall: at(base + gpuMs), vramMb: 0, vramTarget: target });
        vram = await memoryTest(gpuDevice, adapter!, target, signal, (mb) =>
          onProgress({ phase: "vram", overall: at(base + gpuMs + (mb / target) * memoryMs), vramMb: mb, vramTarget: target }),
        );
      } catch (error) {
        if (signal.aborted) throw error;
        const reason = lost ?? "Видеокартата спря да отговаря по време на теста.";
        gpu = { ...gpu, tested: true, reason };
        vram = { ...vram, tested: vram.tested, reason: vram.reason ?? reason };
      } finally {
        gpuDevice.destroy();
      }
    }

    onVisibility();
    return { cpu, gpu, vram, hiddenMs: Math.round(hiddenMs), durationMs: Math.round(performance.now() - started) };
  } finally {
    document.removeEventListener("visibilitychange", onVisibility);
  }
}
