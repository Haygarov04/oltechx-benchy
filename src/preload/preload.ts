import { contextBridge, ipcRenderer } from "electron";
import type { Account, Bridge } from "../shared/types";

/** Мостът: интерфейсът вика само тези функции. Няма достъп до Node, мрежата или файловете. */
const bridge: Bridge = {
  scan: () => ipcRenderer.invoke("scan"),
  account: () => ipcRenderer.invoke("account"),
  connectWithBrowser: (remember) => ipcRenderer.invoke("connect-browser", remember),
  connectWithCode: (code, remember) => ipcRenderer.invoke("connect-code", code, remember),
  cancelConnect: () => ipcRenderer.invoke("cancel-connect"),
  logout: () => ipcRenderer.invoke("logout"),
  onAccount: (listener) => {
    const handler = (_event: unknown, value: Account | { error: string }) => listener(value);
    ipcRenderer.on("account", handler);
    return () => ipcRenderer.removeListener("account", handler);
  },
  upload: (payload) => ipcRenderer.invoke("upload", payload),
  open: (url) => ipcRenderer.invoke("open", url),
  keepAwake: (on) => ipcRenderer.invoke("keep-awake", on),
  siteUrl: () => ipcRenderer.invoke("site-url"),
};

contextBridge.exposeInMainWorld("olx", bridge);
