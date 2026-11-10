import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import type { Account, CheckResults, DetectedPart, DeviceInfo, Uploaded } from "../shared/types";

/**
 * Връзката със сайта. Ключът се пази криптиран от системата (DPAPI на Windows, Keychain на Mac),
 * а без „Запомни ме“ стои само в паметта и изчезва със затварянето на програмата.
 */

export const SITE = (process.env.OLTECHX_URL ?? "https://www.oltechx.com").replace(/\/$/, "");

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

const offline = { error: "Няма връзка със сайта. Провери интернета." };

export async function account(): Promise<Account> {
  load();
  if (!token) return { connected: false };
  try {
    const { status, data } = await call("/api/device/me", { auth: true });
    if (status === 401) {
      // Изключено от сайта: например от Настройки или след продажба на устройството.
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

export async function claim(code: string, deviceName: string, remember: boolean): Promise<Account | { error: string }> {
  try {
    const { status, data } = await call("/api/device/pair/claim", { body: { code, deviceName, platform: "windows", remember } });
    if (status !== 200 || typeof data.token !== "string") return { error: String(data.error ?? "Кодът не става.") };
    save(data.token, remember);
    return { connected: true, userName: String(data.userName ?? ""), remember };
  } catch {
    return offline;
  }
}

let polling: AbortController | null = null;

/** Свързване през браузъра: програмата показва код, сайтът се отваря и човекът потвърждава там. */
export async function startBrowserPairing(
  deviceName: string,
  remember: boolean,
  open: (url: string) => void,
  done: (result: Account | { error: string }) => void,
): Promise<{ code: string } | { error: string }> {
  polling?.abort();
  let start: { status: number; data: Json };
  try {
    start = await call("/api/device/pair/start", { body: { deviceName, platform: "windows", remember } });
  } catch {
    return offline;
  }
  if (start.status !== 200) return { error: "Сайтът не отговори. Опитай пак." };
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
        return done({ error: "Кодът изтече или вече е използван. Опитай пак." });
      } catch {
        // Временно без интернет: пробваме пак.
      }
    }
    if (!controller.signal.aborted) done({ error: "Времето за свързване изтече. Опитай пак." });
  })();
  return { code };
}

export function cancelPairing() {
  polling?.abort();
  polling = null;
}

export async function upload(payload: { device: DeviceInfo; parts: DetectedPart[]; results: CheckResults }): Promise<Uploaded | { error: string }> {
  if (!token) return { error: "Свържи програмата с акаунта си, за да качиш резултата." };
  try {
    const { status, data } = await call("/api/device/checks", { body: payload, auth: true });
    if (status === 401) {
      forget();
      return { error: "Програмата вече не е свързана. Свържи я наново." };
    }
    if (status !== 201) return { error: String(data.error ?? "Сайтът не прие резултата.") };
    return data as unknown as Uploaded;
  } catch {
    return offline;
  }
}
