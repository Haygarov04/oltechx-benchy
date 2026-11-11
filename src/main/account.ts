import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import type { Account, CheckResults, DetectedPart, DeviceInfo, Uploaded } from "../shared/types";

/**
 * The link to the OLTechX site. The token is encrypted by the OS (DPAPI on Windows, Keychain on macOS).
 * Without "Remember me" it lives only in memory and is gone when the app closes.
 * Errors are returned as codes (error.*) and translated by the interface.
 */

export const SITE = (process.env.OLTECHX_URL ?? "https://www.oltechx.com").replace(/\/$/, "");

type Failure = { error: string };

/** The site knows the app by platform: Windows or macOS. */
const PLATFORM = process.platform === "darwin" ? "mac" : "windows";

let token: string | null = null;
let remembered = false;
const file = () => join(app.getPath("userData"), "account.bin");

function load() {
  if (token || !existsSync(file()) || !safeStorage.isEncryptionAvailable()) return;
  try {
    token = safeStorage.decryptString(readFileSync(file()));
    remembered = true;
  } catch {
    rmSync(file(), { force: true });
  }
}

function save(next: string, remember: boolean) {
  token = next;
  remembered = remember;
  rmSync(file(), { force: true });
  if (remember && safeStorage.isEncryptionAvailable()) writeFileSync(file(), safeStorage.encryptString(next));
}

export function forget() {
  token = null;
  remembered = false;
  rmSync(file(), { force: true });
}

type Json = Record<string, unknown>;

async function call(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<{ status: number; data: Json }> {
  const response = await fetch(`${SITE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(init.auth && token ? { authorization: `Bearer ${token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, data };
}

const offline: Failure = { error: "error.offline" };

export async function account(): Promise<Account> {
  load();
  if (!token) return { connected: false };
  try {
    const { status, data } = await call("/api/device/me", { auth: true });
    if (status === 401) {
      // Disconnected on the site: from Settings, or because the device was sold.
      forget();
      return { connected: false };
    }
    return { connected: true, userName: String(data.userName ?? ""), remember: remembered };
  } catch {
    return { connected: true, userName: "", remember: remembered };
  }
}

export async function logout() {
  if (token) await call("/api/device/me", { method: "DELETE", auth: true }).catch(() => undefined);
  forget();
}

export async function claim(code: string, deviceName: string, remember: boolean): Promise<Account | Failure> {
  try {
    const { status, data } = await call("/api/device/pair/claim", { body: { code, deviceName, platform: PLATFORM, remember } });
    if (status !== 200 || typeof data.token !== "string") return { error: "error.code" };
    save(data.token, remember);
    return { connected: true, userName: String(data.userName ?? ""), remember };
  } catch {
    return offline;
  }
}

let polling: AbortController | null = null;

/** Connect through the browser: the app shows a code, the site opens and the user confirms there. */
export async function startBrowserPairing(
  deviceName: string,
  remember: boolean,
  open: (url: string) => void,
  done: (result: Account | Failure) => void,
): Promise<{ code: string } | Failure> {
  polling?.abort();
  let start: { status: number; data: Json };
  try {
    start = await call("/api/device/pair/start", { body: { deviceName, platform: PLATFORM, remember } });
  } catch {
    return offline;
  }
  if (start.status !== 200) return { error: "error.pairing" };
  const { code, deviceCode, verifyUrl, interval } = start.data as { code: string; deviceCode: string; verifyUrl: string; interval: number };
  open(verifyUrl);

  const controller = new AbortController();
  polling = controller;
  void (async () => {
    const until = Date.now() + 10 * 60_000;
    while (!controller.signal.aborted && Date.now() < until) {
      await new Promise((r) => setTimeout(r, (interval || 2) * 1000));
      if (controller.signal.aborted) return;
      try {
        const { status, data } = await call("/api/device/pair/poll", { body: { deviceCode } });
        if (status === 202) continue;
        if (status === 200 && typeof data.token === "string") {
          save(data.token, remember);
          return done({ connected: true, userName: String(data.userName ?? ""), remember });
        }
        return done({ error: "error.expired" });
      } catch {
        // Briefly offline: try again on the next tick.
      }
    }
    if (!controller.signal.aborted) done({ error: "error.timeout" });
  })();
  return { code };
}

export function cancelPairing() {
  polling?.abort();
  polling = null;
}

export async function upload(payload: { device: DeviceInfo; parts: DetectedPart[]; results: CheckResults }): Promise<Uploaded | Failure> {
  if (!token) return { error: "error.notConnected" };
  try {
    const { status, data } = await call("/api/device/checks", { body: payload, auth: true });
    if (status === 401) {
      forget();
      return { error: "error.disconnected" };
    }
    if (status !== 201) return { error: "error.upload" };
    return data as unknown as Uploaded;
  } catch {
    return offline;
  }
}
