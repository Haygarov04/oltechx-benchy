/** The same shapes as on the site (src/lib/device-check.ts). The server validates them again. */

export type DeviceInfo = {
  kind: "computer" | "phone" | "tablet";
  platform: string | null;
  browser: string | null;
  gpuRenderer: string | null;
  gpuVendor: string | null;
  gpuArchitecture: string | null;
  model: string | null;
  threads: number | null;
  memoryGb: number | null;
  screen: string | null;
};

export type PartSlot = "cpu" | "gpu" | "ram" | "motherboard" | "storage" | "battery" | "phone";

export type DetectedPart = {
  slot: PartSlot;
  name: string;
  specs: Record<string, string | number | boolean | null>;
  health?: { label: string; value: string; ok: boolean } | null;
};

export type CheckResults = {
  cpu: { threads: number; single: number; multi: number; checked: number; errors: number };
  gpu: { tested: boolean; reason?: string; opsPerSec: number; samples: number[]; checked: number; errors: number };
  vram: { tested: boolean; reason?: string; testedMb: number; errors: number };
  hiddenMs: number;
  durationMs: number;
};

export type Hardware = {
  device: DeviceInfo;
  parts: DetectedPart[];
  /** Whether the laptop is plugged in. null for a desktop. */
  onPower: boolean | null;
  laptop: boolean;
  /** "MacBook Air (15-inch, M5)", "Lenovo Legion 5 15ACH6H"; null for a custom-built PC. */
  computerName: string | null;
  /** Sold only as a whole device: Macs and laptops. */
  wholeOnly: boolean;
  vramMb: number | null;
  deviceName: string;
};

export type Account = { connected: false } | { connected: true; userName: string; remember: boolean };

export type Uploaded = { id: string; code: string; url: string; sellUrl: string };

/** What the interface can do. Everything goes through the main process; the interface has no network or disk access. */
export type Bridge = {
  scan: () => Promise<Hardware>;
  account: () => Promise<Account>;
  connectWithBrowser: (remember: boolean) => Promise<{ code: string } | { error: string }>;
  connectWithCode: (code: string, remember: boolean) => Promise<Account | { error: string }>;
  cancelConnect: () => Promise<void>;
  logout: () => Promise<void>;
  onAccount: (listener: (account: Account | { error: string }) => void) => () => void;
  upload: (payload: { device: DeviceInfo; parts: DetectedPart[]; results: CheckResults }) => Promise<Uploaded | { error: string }>;
  open: (url: string) => Promise<void>;
  keepAwake: (on: boolean) => Promise<void>;
  siteUrl: () => Promise<string>;
};
