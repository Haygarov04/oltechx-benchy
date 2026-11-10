// Основният процес и мостът към интерфейса се събират с esbuild. Пакетите остават отделно в node_modules.
import { build } from "esbuild";

const common = { bundle: true, platform: "node", target: "node22", sourcemap: false, external: ["electron", "systeminformation"], logLevel: "info" };
await build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main.js", format: "cjs" });
await build({ ...common, entryPoints: ["src/preload/preload.ts"], outfile: "dist/preload.js", format: "cjs" });
