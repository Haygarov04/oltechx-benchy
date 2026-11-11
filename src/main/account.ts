import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import { createAccount } from "../shared/account-core";

/** The desktop app's link to the site. The token is encrypted by the OS (DPAPI on Windows, Keychain on macOS). */

export const SITE = (process.env.OLTECHX_URL ?? "https://www.oltechx.com").replace(/\/$/, "");

const file = () => join(app.getPath("userData"), "account.bin");

let deviceName = "PC";
export const setDeviceName = (name: string) => {
  deviceName = name;
};

export const desktopAccount = createAccount({
  site: SITE,
  platform: process.platform === "darwin" ? "mac" : "windows",
  deviceName: () => deviceName,
  store: {
    async load() {
      if (!existsSync(file()) || !safeStorage.isEncryptionAvailable()) return null;
      try {
        return safeStorage.decryptString(readFileSync(file()));
      } catch {
        rmSync(file(), { force: true });
        return null;
      }
    },
    async save(token) {
      if (safeStorage.isEncryptionAvailable()) writeFileSync(file(), safeStorage.encryptString(token));
    },
    async clear() {
      rmSync(file(), { force: true });
    },
  },
});
