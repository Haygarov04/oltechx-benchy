// node --test tests/*.test.ts (Node 22 runs TypeScript directly)
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForUpdate, isNewer, parseVersion } from "../src/shared/update.ts";

test("versions are compared part by part", () => {
  assert.deepEqual(parseVersion("v0.16.0"), [0, 16, 0]);
  assert.equal(parseVersion("latest"), null);
  assert.equal(isNewer("0.17.0", "0.16.9"), true);
  assert.equal(isNewer("v0.16.10", "0.16.9"), true);
  assert.equal(isNewer("0.16.0", "0.16.0"), false);
  assert.equal(isNewer("0.15.9", "0.16.0"), false);
  assert.equal(isNewer("1.0.0", "0.99.99"), true);
});

test("a newer release gives a notice, the same or older does not", async () => {
  assert.deepEqual(await checkForUpdate("0.16.0", async () => ({ tag_name: "v0.17.0" })), { current: "0.16.0", latest: "0.17.0" });
  assert.equal(await checkForUpdate("0.17.0", async () => ({ tag_name: "v0.17.0" })), null);
  assert.equal(await checkForUpdate("0.16.0", async () => ({ tag_name: "v0.18.0", prerelease: true })), null);
});

test("offline or a GitHub error means no notice, never a crash", async () => {
  assert.equal(await checkForUpdate("0.16.0", async () => { throw new Error("offline"); }), null);
  assert.equal(await checkForUpdate("0.16.0", async () => null), null);
});
