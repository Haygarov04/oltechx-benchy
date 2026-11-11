import { join } from "node:path";
import { app, BrowserWindow, ipcMain, powerSaveBlocker, shell } from "electron";
import { account, cancelPairing, claim, logout, SITE, startBrowserPairing, upload } from "./account";
import { scanHardware } from "./hardware";

// On laptops with two GPUs the test must run on the dedicated one.
app.commandLine.appendSwitch("force_high_performance_gpu");

let window: BrowserWindow | null = null;
let deviceName = "PC";
let awake: number | null = null;

function createWindow() {
  window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    title: "OLTechX Check",
    backgroundColor: "#f6f5f1",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The test must not slow down when the window is behind another one.
      backgroundThrottling: false,
    },
  });
  void window.loadFile(join(__dirname, "renderer", "index.html"));
  // Links only go to the OLTechX site and open in the default browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
}

const openSite = (url: string) => {
  if (url.startsWith(`${SITE}/`)) void shell.openExternal(url);
};

ipcMain.handle("scan", async () => {
  const hardware = await scanHardware();
  deviceName = hardware.deviceName;
  return hardware;
});
ipcMain.handle("account", () => account());
ipcMain.handle("connect-browser", (_event, remember: boolean) =>
  startBrowserPairing(deviceName, Boolean(remember), openSite, (result) => window?.webContents.send("account", result)),
);
ipcMain.handle("connect-code", (_event, code: string, remember: boolean) => claim(String(code), deviceName, Boolean(remember)));
ipcMain.handle("cancel-connect", () => cancelPairing());
ipcMain.handle("logout", () => logout());
ipcMain.handle("upload", (_event, payload) => upload(payload));
ipcMain.handle("open", (_event, url: string) => openSite(String(url)));
ipcMain.handle("keep-awake", (_event, on: boolean) => {
  if (on && awake === null) awake = powerSaveBlocker.start("prevent-display-sleep");
  if (!on && awake !== null) {
    powerSaveBlocker.stop(awake);
    awake = null;
  }
});
ipcMain.handle("site-url", () => SITE);

app.whenReady().then(async () => {
  deviceName = (await scanHardware().catch(() => null))?.deviceName ?? deviceName;
  createWindow();
});
app.on("window-all-closed", () => app.quit());
