import { WORKER_SOURCE } from "./kernels";

/** What a worker reports: work done (operations, bytes or MB, depending on the job), errors and time. */
export type WorkerReport = { done: boolean; work: number; errors: number; ms: number; failed?: string; ns?: number; mb?: number; testedMb?: number };

export type JobResult = { rate: number; work: number; errors: number; reports: WorkerReport[] };

let url: string | null = null;
const workerUrl = () => (url ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" })));

export const stopped = () => new DOMException("Stopped", "AbortError");

/**
 * Runs the same job on `count` workers at once. `onReport` gets the combined rate (work per second)
 * and every worker's last report. Each job gets its own message, for example a different slice of data.
 */
export function runJob(
  jobs: Record<string, unknown> | Record<string, unknown>[],
  count: number,
  signal: AbortSignal,
  onReport?: (rate: number, reports: WorkerReport[]) => void,
): Promise<JobResult> {
  const list = Array.isArray(jobs) ? jobs : Array.from({ length: count }, () => jobs);
  const reports: WorkerReport[] = list.map(() => ({ done: false, work: 0, errors: 0, ms: 1 }));
  const workers = list.map(() => new Worker(workerUrl()));
  const rate = () => reports.reduce((sum, r) => sum + (r.ms > 0 ? r.work / (r.ms / 1000) : 0), 0);
  return new Promise((resolve, reject) => {
    const stop = () => workers.forEach((w) => w.terminate());
    const onAbort = () => {
      stop();
      reject(stopped());
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    workers.forEach((worker, i) => {
      worker.onerror = () => {
        stop();
        signal.removeEventListener("abort", onAbort);
        reject(new Error("A worker stopped."));
      };
      worker.onmessage = (event: MessageEvent<WorkerReport>) => {
        reports[i] = event.data;
        onReport?.(rate(), reports);
        if (reports.every((r) => r.done)) {
          stop();
          signal.removeEventListener("abort", onAbort);
          const failed = reports.find((r) => r.failed);
          if (failed) return reject(new Error(failed.failed));
          resolve({ rate: rate(), work: reports.reduce((s, r) => s + r.work, 0), errors: reports.reduce((s, r) => s + r.errors, 0), reports });
        }
      };
      worker.postMessage(list[i]);
    });
  });
}

/** Turns a growing total into one value per second, for the charts and the heat check. */
export function perSecond() {
  const samples: number[] = [];
  let lastWork = 0;
  let lastTime = 0;
  return {
    samples,
    add(work: number, ms: number) {
      if (ms - lastTime < 1000) return false;
      samples.push(((work - lastWork) / (ms - lastTime)) * 1000);
      lastWork = work;
      lastTime = ms;
      return true;
    },
  };
}
