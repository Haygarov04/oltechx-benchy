import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The interface is loaded from a file, so paths are relative.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../dist/renderer", emptyOutDir: true, target: "chrome130" },
});
