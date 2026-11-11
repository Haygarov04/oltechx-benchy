import { stopped } from "./workers";

/**
 * The graphics stress test through WebGL 2, for devices without WebGPU (many phones and older drivers).
 * The same calculation as the WebGPU test, drawn into an integer texture, so the numbers compare.
 * Every second a frame is read back and checked against answers computed on the processor.
 */

const WIDTH = 1024;
const HEIGHT = 256;
const CELLS = WIDTH * HEIGHT;
const OPS_PER_STEP = 8;
const TARGET_DRAW_MS = 25;

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform uint u_iterations;
uniform uint u_seed;
layout(location = 0) out uvec4 result;
void main() {
  uint index = uint(gl_FragCoord.y) * ${WIDTH}u + uint(gl_FragCoord.x);
  uint x = (index ^ u_seed) * 747796405u + 2891336453u;
  for (uint i = 0u; i < u_iterations; i++) {
    x ^= x << 13u;
    x ^= x >> 17u;
    x ^= x << 5u;
    x = x * 1664525u + 1013904223u;
  }
  result = uvec4(x, 0u, 0u, 1u);
}`;

function reference(index: number, seed: number, iterations: number) {
  let x = (Math.imul((index ^ seed) >>> 0, 747796405) + 2891336453) >>> 0;
  for (let i = 0; i < iterations; i++) {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  }
  return x;
}

export function webglAvailable(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

export async function webglStress(durationMs: number, signal: AbortSignal, onSamples: (samples: number[]) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("WebGL 2 is not available.");

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program");
  gl.useProgram(program);
  const iterationsAt = gl.getUniformLocation(program, "u_iterations");
  const seedAt = gl.getUniformLocation(program, "u_seed");

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32UI, WIDTH, HEIGHT);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, WIDTH, HEIGHT);
  const pixels = new Uint32Array(CELLS * 4);

  const draw = (iterations: number, seed: number) => {
    gl.uniform1ui(iterationsAt, iterations);
    gl.uniform1ui(seedAt, seed);
    const started = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    return performance.now() - started;
  };
  // Let the page breathe between draws, so the interface keeps updating.
  const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

  let iterations = 16;
  for (let i = 0; i < 5; i++) {
    const ms = draw(iterations, 1);
    iterations = Math.min(1 << 16, Math.max(8, Math.round((iterations * TARGET_DRAW_MS) / Math.max(ms, 0.25))));
    await breathe();
  }
  const warm = performance.now() + 4000;
  while (performance.now() < warm) {
    if (signal.aborted) throw stopped();
    draw(iterations, 7);
    await breathe();
  }

  const samples: number[] = [];
  let windowOps = 0;
  let windowMs = 0;
  let checked = 0;
  let errors = 0;
  let lastCheck = 0;
  const end = performance.now() + durationMs;
  while (performance.now() < end) {
    if (signal.aborted) throw stopped();
    const seed = (Math.random() * 4294967296) >>> 0;
    const ms = draw(iterations, seed);
    windowOps += CELLS * iterations * OPS_PER_STEP;
    windowMs += ms;
    if (windowMs >= 1000) {
      samples.push(windowOps / (windowMs / 1000));
      windowOps = 0;
      windowMs = 0;
      onSamples([...samples]);
    }
    if (performance.now() - lastCheck > 1000) {
      lastCheck = performance.now();
      gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA_INTEGER, gl.UNSIGNED_INT, pixels);
      for (let k = 0; k < 48; k++) {
        const index = Math.floor(Math.random() * CELLS);
        if (pixels[index * 4] !== reference(index, seed, iterations)) errors++;
      }
      checked++;
    }
    await breathe();
  }
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  const sorted = [...samples].sort((a, b) => a - b);
  return { opsPerSec: sorted.length ? sorted[sorted.length >> 1] : 0, samples, checked, errors };
}

/** The graphics chip's name as WebGL reports it, for example "Adreno (TM) 750" or "Mali-G715". */
export function webglRenderer(): string | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}
