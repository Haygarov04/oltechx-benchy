import { Capacitor, registerPlugin } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { createAccount } from "../../shared/account-core";
import type { Account, Bridge, DiskResults, Hardware } from "../../shared/types";
import { type NativeInfo, phoneHardware } from "./hardware";

/**
 * The Android version of window.olx: the same functions the desktop app gets from Electron,
 * built from the native plugin, Capacitor's browser and native HTTP.
 */

type OlxDevice = {
  info: () => Promise<NativeInfo>;
  temps: () => Promise<{ battery?: number; thermalStatus?: number }>;
  diskTest: () => Promise<DiskResults>;
  keepAwake: (options: { on: boolean }) => Promise<void>;
  scanQr: () => Promise<{ value?: string }>;
  saveToken: (options: { token: string }) => Promise<void>;
  loadToken: () => Promise<{ token?: string }>;
  clearToken: () => Promise<void>;
};

const Native = registerPlugin<OlxDevice>("OlxDevice");
const SITE = "https://www.oltechx.com";

export const isAndroid = () => Capacitor.getPlatform() === "android";

export function installAndroidBridge() {
  let hardware: Hardware | null = null;
  const listeners = new Set<(account: Account | { error: string }) => void>();
  const account = createAccount({
    site: SITE,
    platform: "android",
    deviceName: () => hardware?.deviceName ?? "Android",
    store: {
      load: async () => (await Native.loadToken()).token ?? null,
      save: (token) => Native.saveToken({ token }),
      clear: () => Native.clearToken(),
    },
  });
  const open = (url: string) => {
    if (url.startsWith(`${SITE}/`)) void Browser.open({ url });
  };

  const bridge: Bridge = {
    platform: "android",
    scan: async () => (hardware = phoneHardware(await Native.info())),
    account: () => account.account(),
    connectWithBrowser: (remember) => account.startBrowserPairing(remember, open, (result) => listeners.forEach((listener) => listener(result))),
    connectWithCode: (code, remember) => account.claim(code, remember),
    cancelConnect: async () => account.cancelPairing(),
    logout: () => account.logout(),
    onAccount: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    upload: (payload) => account.upload(payload),
    open: async (url) => open(url),
    keepAwake: (on) => Native.keepAwake({ on }),
    siteUrl: async () => SITE,
    diskTest: () => Native.diskTest(),
    temps: async () => ({ cpu: null, gpu: null, battery: (await Native.temps()).battery ?? null }),
    scanQr: async () => (await Native.scanQr()).value ?? null,
  };
  (window as unknown as { olx: Bridge }).olx = bridge;
}
