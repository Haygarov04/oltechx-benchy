import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The interface is loaded from a file, so paths are relative.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  // Not minified: the test workers are built from function source text, and the app size does not matter here.
  build: { outDir: "../../dist/renderer", emptyOutDir: true, target: "chrome130", minify: false },
});
