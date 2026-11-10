import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Интерфейсът се зарежда от файл, затова пътищата са относителни.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../dist/renderer", emptyOutDir: true, target: "chrome130" },
});
