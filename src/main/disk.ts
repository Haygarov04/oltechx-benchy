import { randomBytes } from "node:crypto";
import { open, rm, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiskResults } from "../shared/types";

const MB = 1024 * 1024;
const failed = (reason: string): DiskResults => ({ tested: false, reason, write: 0, iops: 0, testedMb: 0 });

/**
 * The system drive: writes up to 1 GB of random data (drives that compress cannot cheat) and flushes it
 * to the drive, then does small 4 KB writes at random places. The file is deleted at the end.
 * Reading is not measured: the system would serve the file from its cache, not from the drive.
 */
export async function diskTest(): Promise<DiskResults> {
  const dir = tmpdir();
  const file = join(dir, `oltechx-check-${process.pid}-${Date.now()}.bin`);
  try {
    const space = await statfs(dir);
    if (space.bavail * space.bsize < 4 * 1024 * MB) return failed("Няма достатъчно свободно място на диска за теста.");

    const block = randomBytes(8 * MB);
    let written = 0;
    const handle = await open(file, "w");
    const start = performance.now();
    try {
      while (written < 1024 * MB && performance.now() - start < 7000) {
        await handle.write(block, 0, block.length, written);
        written += block.length;
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    const write = written / ((performance.now() - start) / 1000);

    const pageCount = Math.floor(written / 4096);
    const page = randomBytes(4096);
    const small = await open(file, "r+");
    let ops = 0;
    const randomStart = performance.now();
    try {
      while (performance.now() - randomStart < 2500) {
        for (let i = 0; i < 16; i++) {
          await small.write(page, 0, 4096, Math.floor(Math.random() * pageCount) * 4096);
          ops++;
        }
        await small.datasync();
      }
    } finally {
      await small.close();
    }
    const iops = ops / ((performance.now() - randomStart) / 1000);
    return { tested: true, write, iops, testedMb: Math.round(written / MB) };
  } catch {
    return failed("Тестът на диска не успя.");
  } finally {
    await rm(file, { force: true }).catch(() => undefined);
  }
}
