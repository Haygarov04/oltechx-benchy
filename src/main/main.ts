import { join } from "node:path";
import { app, BrowserWindow, ipcMain, powerSaveBlocker, shell } from "electron";
import { desktopAccount as account, SITE, setDeviceName } from "./account";
import { diskTest } from "./disk";
import { readTemps, scanHardware } from "./hardware";

// On laptops with two GPUs the test must run on the dedicated one.
app.commandLine.appendSwitch("force_high_performance_gpu");

// Automated tests run with their own settings folder and a window that does not take focus,
// so they never touch the account or the window of the installed app.
const testing = Boolean(process.env.OLTECHX_USER_DATA);
if (testing) app.setPath("userData", process.env.OLTECHX_USER_DATA!);

let window: BrowserWindow | null = null;
let awake: number | null = null;

function createWindow() {
  window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    title: "OLTechX Check",
    show: !testing,
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
  if (testing) window.showInactive();
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
  setDeviceName(hardware.deviceName);
  return hardware;
});
ipcMain.handle("account", () => account.account());
ipcMain.handle("connect-browser", (_event, remember: boolean) =>
  account.startBrowserPairing(Boolean(remember), openSite, (result) => window?.webContents.send("account", result)),
);
ipcMain.handle("connect-code", (_event, code: string, remember: boolean) => account.claim(String(code), Boolean(remember)));
ipcMain.handle("cancel-connect", () => account.cancelPairing());
ipcMain.handle("logout", () => account.logout());
ipcMain.handle("upload", (_event, payload) => account.upload(payload));
ipcMain.handle("live", (_event, stage: string, progress: number) => account.live(String(stage), Number(progress)));
ipcMain.handle("open", (_event, url: string) => openSite(String(url)));
ipcMain.handle("keep-awake", (_event, on: boolean) => {
  if (on && awake === null) awake = powerSaveBlocker.start("prevent-display-sleep");
  if (!on && awake !== null) {
    powerSaveBlocker.stop(awake);
    awake = null;
  }
});
ipcMain.handle("site-url", () => SITE);
ipcMain.handle("disk-test", () => diskTest());
ipcMain.handle("temps", () => readTemps());

app.whenReady().then(async () => {
  setDeviceName((await scanHardware().catch(() => null))?.deviceName ?? "PC");
  createWindow();
});
app.on("window-all-closed", () => app.quit());
