import { contextBridge, ipcRenderer } from "electron";
import type { Account, Bridge } from "../shared/types";

/** The bridge: the interface can only call these functions. It has no access to Node, the network or files. */
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
