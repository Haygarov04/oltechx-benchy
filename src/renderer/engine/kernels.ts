/**
 * The calculations that run inside Web Workers. Every function here is turned into text and loaded
 * into the worker (see WORKER_SOURCE), so it may only use the other functions in this file and
 * what a worker has: Math, typed arrays, crypto.subtle and CompressionStream.
 *
 * Every job has a known correct answer or checks itself, so a wrong result means unstable hardware.
 */

/** Integer work: xorshift and a multiply, 7 operations per step. */
export function intUnit(seed: number, n: number): number {
  let x = seed | 0;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x = (Math.imul(x, 1664525) + 1013904223) | 0;
  }
  return x;
}

/**
 * Floating point work: multiplies two n×n matrices of doubles and returns a checksum.
 * JavaScript rounds every operation the same way on every processor, so the checksum is exact.
 */
export function matmulUnit(seed: number, n: number, a: Float64Array, b: Float64Array, c: Float64Array): number {
  const size = n * n;
  for (let i = 0; i < size; i++) {
    a[i] = ((i * 7919 + seed) % 1009) / 1009 - 0.5;
    b[i] = ((i * 104729 + seed * 3) % 1013) / 1013 - 0.5;
    c[i] = 0;
  }
  for (let i = 0; i < n; i++) {
    const row = i * n;
    for (let k = 0; k < n; k++) {
      const aik = a[row + k];
      const bk = k * n;
      for (let j = 0; j < n; j++) c[row + j] += aik * b[bk + j];
    }
  }
  let sum = 0;
  for (let i = 0; i < size; i++) sum += c[i] * ((i % 7) + 1);
  return sum;
}

type Job =
  | { kind: "int"; durationMs: number; n: number; seeds: number[]; expected: number[] }
  | { kind: "float"; durationMs: number; n: number; seeds: number[]; expected: number[] }
  | { kind: "hash"; durationMs: number; data: ArrayBuffer; expected: number[] }
  | { kind: "compress"; durationMs: number; data: Uint8Array }
  | { kind: "copy"; durationMs: number; bytes: number }
  | { kind: "chase"; durationMs: number; entries: number }
  | { kind: "memtest"; mb: number; chunkMb: number; seed: number };

/** The worker itself: takes one job, reports progress about four times a second and the total at the end. */
export function workerBody() {
  const scope = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage: (message: unknown) => void };
  const now = () => performance.now();

  scope.onmessage = async (event: MessageEvent) => {
    const job = event.data as Job;
    const start = now();
    let work = 0;
    let errors = 0;
    let busy = 0;
    let last = start;
    // Most jobs count wall time; compression counts only the time spent compressing.
    const elapsed = () => (job.kind === "compress" ? busy : now() - start);
    const tick = (extra?: Record<string, number>) => {
      const t = now();
      if (t - last < 250) return;
      last = t;
      scope.postMessage({ done: false, work, errors, ms: elapsed(), ...extra });
    };
    const finish = (extra?: Record<string, number>) => scope.postMessage({ done: true, work, errors, ms: elapsed(), ...extra });

    try {
      switch (job.kind) {
        case "int": {
          const end = start + job.durationMs;
          for (let k = 0; now() < end; k++) {
            const i = k % job.seeds.length;
            if (intUnit(job.seeds[i], job.n) !== job.expected[i]) errors++;
            work += job.n * 7;
            tick();
          }
          return finish();
        }
        case "float": {
          const size = job.n * job.n;
          const a = new Float64Array(size);
          const b = new Float64Array(size);
          const c = new Float64Array(size);
          const end = start + job.durationMs;
          for (let k = 0; now() < end; k++) {
            const i = k % job.seeds.length;
            if (matmulUnit(job.seeds[i], job.n, a, b, c) !== job.expected[i]) errors++;
            work += 2 * job.n * job.n * job.n;
            tick();
          }
          return finish();
        }
        case "hash": {
          const end = start + job.durationMs;
          while (now() < end) {
            const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", job.data));
            for (let i = 0; i < digest.length; i++) {
              if (digest[i] !== job.expected[i]) {
                errors++;
                break;
              }
            }
            work += job.data.byteLength;
            tick();
          }
          return finish();
        }
        case "compress": {
          const run = async (input: Uint8Array, stream: CompressionStream | DecompressionStream) =>
            new Uint8Array(await new Response(new Blob([input as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
          const end = start + job.durationMs;
          let verified = start;
          while (now() < end) {
            const t = now();
            const packed = await run(job.data, new CompressionStream("deflate-raw"));
            busy += now() - t;
            work += job.data.byteLength;
            // About once a second the result is unpacked and compared byte by byte.
            if (now() - verified > 1000) {
              verified = now();
              const back = await run(packed, new DecompressionStream("deflate-raw"));
              let same = back.length === job.data.length;
              for (let i = 0; same && i < back.length; i++) same = back[i] === job.data[i];
              if (!same) errors++;
            }
            tick();
          }
          return finish();
        }
        case "copy": {
          // Two arrays far larger than the processor cache: every copy goes through the RAM.
          const length = Math.floor(job.bytes / 8);
          const a = new Float64Array(length);
          const b = new Float64Array(length);
          for (let i = 0; i < length; i++) a[i] = i;
          b.set(a);
          const begin = now();
          const end = begin + job.durationMs;
          let moved = 0;
          while (now() < end) {
            b.set(a);
            a.set(b);
            // Each copy reads one array and writes the other.
            moved += length * 8 * 4;
            work = moved;
            tick();
          }
          const probe = (length * 0.618) | 0;
          if (a[probe] !== probe || b[length - 1] !== length - 1) errors++;
          return scope.postMessage({ done: true, work: moved, errors, ms: now() - begin });
        }
        case "chase": {
          // One long random cycle through the RAM: every step waits for the previous one.
          const n = job.entries;
          const next = new Int32Array(n);
          for (let i = 0; i < n; i++) next[i] = i;
          let r = 0x2545f491;
          for (let i = n - 1; i > 0; i--) {
            r ^= r << 13;
            r ^= r >>> 17;
            r ^= r << 5;
            const j = (r >>> 0) % i;
            const t = next[i];
            next[i] = next[j];
            next[j] = t;
          }
          let p = 0;
          let steps = 0;
          const begin = now();
          const end = begin + job.durationMs;
          while (now() < end) {
            for (let s = 0; s < 250_000; s++) p = next[p];
            steps += 250_000;
            work = steps;
            tick();
          }
          const ns = ((now() - begin) * 1e6) / steps;
          return scope.postMessage({ done: true, work: steps, errors: p < 0 ? 1 : 0, ms: now() - begin, ns });
        }
        case "memtest": {
          // Fills as much RAM as asked with a pattern, then reads it all back. Twice, the second time with every bit flipped.
          const chunks: Uint32Array[] = [];
          try {
            for (let mb = 0; mb < job.mb; mb += job.chunkMb) chunks.push(new Uint32Array(job.chunkMb * 262_144));
          } catch {
            // The system gave less memory than asked: test what we got.
          }
          const testedMb = chunks.length * job.chunkMb;
          let doneMb = 0;
          for (const invert of [0, -1]) {
            for (let c = 0; c < chunks.length; c++) {
              const cells = chunks[c];
              const seed = job.seed ^ Math.imul(c + 1, 0x9e3779b9);
              for (let i = 0; i < cells.length; i++) {
                let x = Math.imul(i ^ seed, 747796405) + 2891336453;
                x ^= x >>> 16;
                cells[i] = Math.imul(x, 2654435769) ^ invert;
              }
              doneMb += job.chunkMb / 2;
              tick({ mb: doneMb / 2, testedMb });
            }
            for (let c = 0; c < chunks.length; c++) {
              const cells = chunks[c];
              const seed = job.seed ^ Math.imul(c + 1, 0x9e3779b9);
              for (let i = 0; i < cells.length; i++) {
                let x = Math.imul(i ^ seed, 747796405) + 2891336453;
                x ^= x >>> 16;
                if (cells[i] !== (Math.imul(x, 2654435769) ^ invert) >>> 0) errors++;
              }
              doneMb += job.chunkMb / 2;
              work = doneMb;
              tick({ mb: doneMb / 2, testedMb });
            }
          }
          return finish({ mb: testedMb, testedMb });
        }
      }
    } catch (error) {
      scope.postMessage({ done: true, work, errors, ms: elapsed(), failed: String(error) });
    }
  };
}

/** The source of the worker: the functions above as text. */
export const WORKER_SOURCE = `${intUnit.toString()}\n${matmulUnit.toString()}\n(${workerBody.toString()})();`;
