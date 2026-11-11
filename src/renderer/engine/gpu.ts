/// <reference types="@webgpu/types" />
import { stopped } from "./workers";

/**
 * Graphics card tests on WebGPU. Every result is checked against an answer computed on the processor.
 * Failure reasons stay in Bulgarian because the OLTechX site shows them to buyers.
 */

const MB = 1024 * 1024;

export async function requestAdapter(): Promise<GPUAdapter | null> {
  try {
    return (await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" })) ?? null;
  } catch {
    return null;
  }
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

export async function gpuStress(device: GPUDevice, durationMs: number, signal: AbortSignal, onSamples: (samples: number[]) => void) {
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
    if (signal.aborted) throw stopped();
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
    if (signal.aborted) throw stopped();
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
export async function memoryTest(device: GPUDevice, adapter: GPUAdapter, targetMb: number, signal: AbortSignal, onMb: (mb: number) => void) {
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
      if (signal.aborted) throw stopped();
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


// ── Floating point (FP32) ────────────────────────────────────────────────────

/**
 * Four chains of x = x·x + c per thread, the work games and AI do. Each chain settles on a value
 * that floats represent exactly (0.125, 0.0625, 0.09375, 0.03125), so every result must be 0.3125.
 * x·x + c cannot be folded into fewer operations, so the compiler cannot skip work.
 */
const FLOPS = /* wgsl */ `
struct Params { iterations: u32, pad: u32 };
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let start = f32(id.x & 255u) * (1.0 / 2048.0);
  var a = start;
  var b = start + 0.01;
  var c = start + 0.02;
  var d = start + 0.03;
  for (var i = 0u; i < params.iterations; i++) {
    a = fma(a, a, 0.109375); b = fma(b, b, 0.05859375); c = fma(c, c, 0.0849609375); d = fma(d, d, 0.0302734375);
    a = fma(a, a, 0.109375); b = fma(b, b, 0.05859375); c = fma(c, c, 0.0849609375); d = fma(d, d, 0.0302734375);
    a = fma(a, a, 0.109375); b = fma(b, b, 0.05859375); c = fma(c, c, 0.0849609375); d = fma(d, d, 0.0302734375);
    a = fma(a, a, 0.109375); b = fma(b, b, 0.05859375); c = fma(c, c, 0.0849609375); d = fma(d, d, 0.0302734375);
  }
  out[id.x] = a + b + c + d;
}`;
const FLOPS_PER_ITERATION = 4 * 4 * 2;
const FLOPS_EXPECTED = 0.3125;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[sorted.length >> 1] : 0;
};

export async function flopsTest(device: GPUDevice, durationMs: number, signal: AbortSignal, onRate: (flops: number) => void) {
  const shader = device.createShaderModule({ code: FLOPS });
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
  const dispatch = async (iterations: number, copy: boolean) => {
    device.queue.writeBuffer(params, 0, new Uint32Array([iterations, 0]));
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

  let iterations = 64;
  for (let i = 0; i < 5; i++) {
    const ms = await dispatch(iterations, false);
    iterations = Math.min(1 << 18, Math.max(64, Math.round((iterations * TARGET_DISPATCH_MS) / Math.max(ms, 0.25))));
  }

  const rates: number[] = [];
  let checked = 0;
  let errors = 0;
  let lastCheck = 0;
  const end = performance.now() + durationMs;
  while (performance.now() < end) {
    if (signal.aborted) throw stopped();
    const verify = performance.now() - lastCheck > 1000;
    const ms = await dispatch(iterations, verify);
    rates.push((INVOCATIONS * iterations * FLOPS_PER_ITERATION) / (ms / 1000));
    onRate(median(rates));
    if (verify) {
      lastCheck = performance.now();
      await read.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(read.getMappedRange().slice(0));
      read.unmap();
      for (let k = 0; k < 64; k++) {
        if (Math.abs(values[Math.floor(Math.random() * INVOCATIONS)] - FLOPS_EXPECTED) > 1e-6) errors++;
      }
      checked++;
    }
  }
  [out, read, params].forEach((b) => b.destroy());
  return { flops: median(rates), checked, errors };
}

// ── Memory bandwidth ─────────────────────────────────────────────────────────

const COPY = /* wgsl */ `
struct Params { count: u32, key: u32 };
@group(0) @binding(0) var<storage, read> src: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec4<u32>>;
@group(0) @binding(2) var<uniform> params: Params;
const THREADS: u32 = 1048576u;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  for (var i = id.x; i < params.count; i += THREADS) { dst[i] = src[i] ^ vec4<u32>(params.key); }
}`;

const pattern = (i: number) => (Math.imul(i ^ 0x5bd1e995, 747796405) + 2891336453) >>> 0;

/** Copies a block far larger than the card's cache back and forth: how fast its memory really is. */
export async function bandwidthTest(device: GPUDevice, adapter: GPUAdapter, durationMs: number, signal: AbortSignal, onRate: (bytesPerSec: number) => void) {
  const bytes = Math.floor(Math.min(256 * MB, adapter.limits.maxStorageBufferBindingSize, adapter.limits.maxBufferSize) / 16) * 16;
  const count = bytes / 16;
  const src = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE, mappedAtCreation: true });
  const words = new Uint32Array(src.getMappedRange());
  for (let i = 0; i < words.length; i++) words[i] = pattern(i);
  src.unmap();
  const dst = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const sample = 64 * 1024;
  const read = device.createBuffer({ size: sample, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const params = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const shader = device.createShaderModule({ code: COPY });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint: "main" } });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: src } },
      { binding: 1, resource: { buffer: dst } },
      { binding: 2, resource: { buffer: params } },
    ],
  });

  const batch = async (key: number, copyFrom: number | null) => {
    device.queue.writeBuffer(params, 0, new Uint32Array([count, key]));
    const encoder = device.createCommandEncoder();
    for (let i = 0; i < 4; i++) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(4096);
      pass.end();
    }
    if (copyFrom !== null) encoder.copyBufferToBuffer(dst, copyFrom, read, 0, sample);
    const started = performance.now();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    return performance.now() - started;
  };

  await batch(1, null);
  const rates: number[] = [];
  let errors = 0;
  let lastCheck = 0;
  const end = performance.now() + durationMs;
  while (performance.now() < end) {
    if (signal.aborted) throw stopped();
    const key = (Math.random() * 4294967296) >>> 0;
    const verify = performance.now() - lastCheck > 700;
    const offset = verify ? Math.floor((Math.random() * (bytes - sample)) / 16) * 16 : null;
    const ms = await batch(key, offset);
    // Four copies, each reads the block once and writes it once.
    rates.push((bytes * 2 * 4) / (ms / 1000));
    onRate(median(rates));
    if (offset !== null) {
      lastCheck = performance.now();
      await read.mapAsync(GPUMapMode.READ);
      const got = new Uint32Array(read.getMappedRange().slice(0));
      read.unmap();
      const first = offset / 4;
      for (let k = 0; k < got.length; k += 97) if (got[k] !== (pattern(first + k) ^ key) >>> 0) errors++;
    }
  }
  [src, dst, read, params].forEach((b) => b.destroy());
  return { bandwidth: median(rates), errors };
}
