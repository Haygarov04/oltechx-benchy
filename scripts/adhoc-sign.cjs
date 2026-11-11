// Ad-hoc signature for the macOS app. Apple Silicon refuses to run unsigned code, and a free
// ad-hoc signature is enough for that. It does not replace Apple's paid Developer ID signing,
// so a downloaded .dmg still needs "Open Anyway" once; the curl installer avoids that prompt.
const { execFileSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = readdirSync(context.appOutDir).find((name) => name.endsWith(".app"));
  if (!app) throw new Error("No .app found to sign");
  const path = join(context.appOutDir, app);
  execFileSync("xattr", ["-cr", path], { stdio: "inherit" });
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", path], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", path], { stdio: "inherit" });
};
