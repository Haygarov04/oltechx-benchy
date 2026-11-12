// A smoke test of the built app on a real machine: it starts the app, reads the hardware and runs
// the whole check, then fails if any test reports errors. CI runs it on Windows and macOS before a
// release, so a broken build is never published. Run locally with: npm run build && node scripts/smoke.mjs
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPath from "electron";
import { _electron as electron } from "playwright-core";

const failures = [];
// On GitHub a failure is also written as an annotation, which anyone can read without the log.
const annotate = (message) =>
  process.env.GITHUB_ACTIONS &&
  console.log(
    `::error title=Smoke test (${process.platform})::${message.replace(/\r?\n/g, " ")}`,
  );
const check = (ok, message) => {
  if (!ok) {
    failures.push(message);
    annotate(message);
  }
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
};
// Anything that throws (a timeout, a crash) is also an annotation, so the reason is always visible.
const crashed = (error) => {
  annotate(`crashed: ${error?.message ?? error}`);
  console.error(error);
  process.exit(1);
};
process.on("unhandledRejection", crashed);
process.on("uncaughtException", crashed);

async function run() {
  const app = await electron.launch({
    executablePath: electronPath,
    args: ["."],
    // No site and a fresh profile: nothing is uploaded and no account is touched.
    env: {
      ...process.env,
      OLTECHX_URL: "http://127.0.0.1:9",
      OLTECHX_USER_DATA: mkdtempSync(join(tmpdir(), "oltechx-smoke-")),
    },
  });
  try {
    const win = await app.firstWindow();
    const errors = [];
    win.on("pageerror", (error) => errors.push(String(error)));
    win.on(
      "console",
      (message) => message.type() === "error" && errors.push(message.text()),
    );
    app.process().stderr?.on("data", (data) => process.stderr.write(data));
    await win.waitForSelector(".part", { timeout: 120_000 });

    const hardware = await win.evaluate(() => window.olx.scan());
    console.log(
      `computer: ${hardware.computerName ?? "custom build"} · ${hardware.device.platform} · ${hardware.device.threads} threads · ${hardware.device.memoryGb} GB`,
    );
    for (const part of hardware.parts)
      console.log(
        `  ${part.slot.padEnd(11)} ${part.name}${part.serial ? " · serial found" : ""}`,
      );
    for (const slot of ["cpu", "ram", "storage"])
      check(
        hardware.parts.some((p) => p.slot === slot),
        `found a part: ${slot}`,
      );

    const started = Date.now();
    await win.locator(".btn-xl").click();
    // While it runs, report the stage now and then, so a hang shows where it stopped.
    let stage = "";
    const watch = setInterval(async () => {
      const now = await win
        .locator(".stage[data-state=active] .stage-name")
        .first()
        .textContent()
        .catch(() => null);
      if (now && now !== stage) console.log(`  stage: ${(stage = now)}`);
    }, 2000);
    try {
      await win.waitForSelector(".verdict", { timeout: 480_000 });
    } catch (error) {
      await win
        .screenshot({ path: "smoke.png", fullPage: true })
        .catch(() => undefined);
      throw new Error(
        `the check did not finish (last stage: ${stage || "none"}; interface errors: ${errors.join(" | ") || "none"})`,
      );
    } finally {
      clearInterval(watch);
    }
    const results = await win.evaluate(() => window.__olxLastResults);
    console.log(
      `check finished in ${Math.round((Date.now() - started) / 1000)} s`,
    );
    console.log(
      JSON.stringify(
        {
          cpu: {
            single: results.cpu.single,
            multi: results.cpu.multi,
            float: results.cpu.float?.multi,
            hash: results.cpu.hash,
          },
          ram: results.ram,
          gpu: {
            tested: results.gpu.tested,
            reason: results.gpu.reason,
            api: results.gpu.api,
            ops: results.gpu.opsPerSec,
            flops: results.gpu.flops,
          },
          vram: results.vram,
          disk: results.disk,
        },
        null,
        1,
      ),
    );

    check(
      results.cpu.multi > 0 && results.cpu.errors === 0,
      "processor: speed measured, no errors",
    );
    check(
      !results.cpu.float || results.cpu.float.errors === 0,
      "processor floating point: no errors",
    );
    check(
      results.ram && results.ram.testedMb > 0 && results.ram.errors === 0,
      "RAM: tested, no errors",
    );
    check(
      !results.gpu.tested || results.gpu.reason || results.gpu.errors === 0,
      "graphics: no errors (or not available on this machine)",
    );
    check(
      !results.vram.tested || results.vram.errors === 0,
      "graphics memory: no errors",
    );
    check(
      results.disk &&
        (results.disk.tested
          ? results.disk.write > 0
          : Boolean(results.disk.reason)),
      "drive: measured (or a reason given)",
    );
    check(
      errors.length === 0,
      `no errors in the interface${errors.length ? `: ${errors.join(" | ")}` : ""}`,
    );
    await win.screenshot({ path: "smoke.png", fullPage: true });
  } finally {
    await app.close().catch(() => undefined);
  }
}
await run().catch(crashed);
if (failures.length) {
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log("\nsmoke test passed");
