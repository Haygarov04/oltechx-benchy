import type { Account, Theme, Uploaded, UploadPayload } from "./types";

/**
 * The link to the OLTechX site, shared by the desktop app (main process) and the Android app (WebView).
 * Each platform brings its own encrypted token store: Windows DPAPI / macOS Keychain, or the Android Keystore.
 * Without "Remember me" the token lives only in memory and is gone when the app closes.
 * Errors are returned as codes (error.*) and translated by the interface.
 */

export type TokenStore = {
  load: () => Promise<string | null>;
  save: (token: string) => Promise<void>;
  clear: () => Promise<void>;
};

type Failure = { error: string };
type Json = Record<string, unknown>;

const offline: Failure = { error: "error.offline" };

export function createAccount(options: { site: string; platform: "windows" | "mac" | "android"; store: TokenStore; deviceName: () => string }) {
  const site = options.site.replace(/\/$/, "");
  let token: string | null = null;
  let remembered = false;
  let loaded = false;
  let polling: AbortController | null = null;

  async function load() {
    if (loaded) return;
    loaded = true;
    if (token) return;
    const saved = await options.store.load().catch(() => null);
    if (saved) {
      token = saved;
      remembered = true;
    }
  }

  async function save(next: string, remember: boolean) {
    token = next;
    remembered = remember;
    await options.store.clear().catch(() => undefined);
    if (remember) await options.store.save(next).catch(() => undefined);
  }

  async function forget() {
    token = null;
    remembered = false;
    await options.store.clear().catch(() => undefined);
  }

  async function call(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<{ status: number; data: Json }> {
    const response = await fetch(`${site}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(init.auth && token ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const data = (await response.json().catch(() => ({}))) as Json;
    return { status: response.status, data };
  }

  return {
    site,

    async account(): Promise<Account> {
      await load();
      if (!token) return { connected: false };
      try {
        const { status, data } = await call("/api/device/me", { auth: true });
        if (status === 401) {
          // Disconnected on the site: from Settings, or because the device was sold.
          await forget();
          return { connected: false };
        }
        const theme = data.theme === "light" || data.theme === "dark" || data.theme === "system" ? (data.theme as Theme) : null;
        return { connected: true, userName: String(data.userName ?? ""), remember: remembered, theme };
      } catch {
        return { connected: true, userName: "", remember: remembered };
      }
    },

    async logout() {
      if (token) await call("/api/device/me", { method: "DELETE", auth: true }).catch(() => undefined);
      await forget();
    },

    async claim(code: string, remember: boolean): Promise<Account | Failure> {
      try {
        const { status, data } = await call("/api/device/pair/claim", { body: { code, deviceName: options.deviceName(), platform: options.platform, remember } });
        if (status !== 200 || typeof data.token !== "string") return { error: "error.code" };
        await save(data.token, remember);
        return { connected: true, userName: String(data.userName ?? ""), remember };
      } catch {
        return offline;
      }
    },

    /** Connect through the browser: the app shows a code, the site opens and the user confirms there. */
    async startBrowserPairing(remember: boolean, open: (url: string) => void, done: (result: Account | Failure) => void): Promise<{ code: string } | Failure> {
      polling?.abort();
      let start: { status: number; data: Json };
      try {
        start = await call("/api/device/pair/start", { body: { deviceName: options.deviceName(), platform: options.platform, remember } });
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
              await save(data.token, remember);
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
    },

    cancelPairing() {
      polling?.abort();
      polling = null;
    },

    /** The theme chosen in the app goes to the account, so the site and other devices use it too. */
    async saveTheme(theme: Theme): Promise<void> {
      await load();
      if (!token) return;
      await call("/api/device/me", { method: "PATCH", body: { theme }, auth: true }).catch(() => undefined);
    },

    /** Tells the site how far the check is, so the page open on another device can follow it live. */
    async live(stage: string, progress: number): Promise<void> {
      if (!token) return;
      await call("/api/device/live", { body: { stage, progress: Math.round(progress) }, auth: true }).catch(() => undefined);
    },

    async upload(payload: UploadPayload): Promise<Uploaded | Failure> {
      await load();
      if (!token) return { error: "error.notConnected" };
      try {
        const { status, data } = await call("/api/device/checks", { body: payload, auth: true });
        if (status === 401) {
          await forget();
          return { error: "error.disconnected" };
        }
        if (status !== 201) return { error: "error.upload" };
        return data as unknown as Uploaded;
      } catch {
        return offline;
      }
    },
  };
}
