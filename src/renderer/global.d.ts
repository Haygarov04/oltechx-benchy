import type { Bridge } from "../shared/types";

declare global {
  interface Window {
    olx: Bridge;
  }
}
declare module "*.webp" { const url: string; export default url; }
