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
  /** The factory serial number. The site stores only a fingerprint and the last 4 characters. */
  serial?: string | null;
  specs: Record<string, string | number | boolean | null>;
  health?: { label: string; value: string; ok: boolean } | null;
};

/** Rates are per second: operations, floating point operations (FLOPS) or bytes. */
export type CheckResults = {
  cpu: {
    threads: number;
    /** Integer operations per second on one core and on all cores. */
    single: number;
    multi: number;
    checked: number;
    errors: number;
    /** All cores, second by second: a falling line means the processor slows down when it gets hot. */
    samples?: number[];
    /** Double precision matrix multiply, FLOPS. */
    float?: { single: number; multi: number; errors: number };
    /** SHA-256 on all cores, bytes per second. */
    hash?: number;
    /** Deflate compression on all cores, bytes per second. */
    compress?: number;
  };
  gpu: {
    tested: boolean;
    reason?: string;
    opsPerSec: number;
    samples: number[];
    checked: number;
    errors: number;
    /** Which graphics interface ran the test: WebGPU, or WebGL 2 where WebGPU is missing. */
    api?: "webgpu" | "webgl";
    /** FP32 throughput, FLOPS. */
    flops?: number;
    /** Memory bandwidth, bytes per second. */
    bandwidth?: number;
  };
  vram: { tested: boolean; reason?: string; testedMb: number; errors: number };
  ram?: { bandwidth: number; latencyNs: number; testedMb: number; errors: number };
  disk?: DiskResults;
  temps?: { cpuMax: number | null; gpuMax: number | null; batteryMax?: number | null };
  hiddenMs: number;
  durationMs: number;
};

/** The system drive: sequential writes and small random writes, both flushed to the drive. */
export type DiskResults = { tested: boolean; reason?: string; write: number; iops: number; testedMb: number };

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
  /** The serial number of the whole computer (laptops, Macs, ready-made PCs). */
  serial: string | null;
  /** Android: a per-app device id. Not a factory serial, so the buyer sees nothing of it. */
  deviceId?: string | null;
};

export type UploadPayload = { device: DeviceInfo; parts: DetectedPart[]; results: CheckResults; serial: string | null; deviceId?: string | null };

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
  upload: (payload: UploadPayload) => Promise<Uploaded | { error: string }>;
  /** Writes about 1 GB to the system drive and deletes it. */
  diskTest: () => Promise<DiskResults>;
  /** Current temperatures in °C, null where the system does not report them. */
  temps: () => Promise<{ cpu: number | null; gpu: number | null; battery?: number | null }>;
  /** Reports the stage and the percent done to the site, for the live view on another device. */
  live: (stage: string, progress: number) => Promise<void>;
  /** Android only: scan the QR code shown on the site. */
  scanQr?: () => Promise<string | null>;
  /** Where the interface runs. */
  platform?: "desktop" | "android";
  open: (url: string) => Promise<void>;
  keepAwake: (on: boolean) => Promise<void>;
  siteUrl: () => Promise<string>;
};
