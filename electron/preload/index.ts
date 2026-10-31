import { contextBridge, ipcRenderer } from "electron";
import { methods, Bridge } from "../../src/types/api";
const api: Bridge = {
  request: (method, params = {}) => {
    if (!methods.includes(method))
      return Promise.reject(new Error("Unsupported operation"));
    return ipcRenderer.invoke("eu5:request", method, params);
  },
  preferences: (theme) => ipcRenderer.invoke("eu5:preferences", theme),
  gameVersion: (value) => ipcRenderer.invoke("eu5:game-version", value),
  respondConfirmation: (token, action) => ipcRenderer.invoke("eu5:confirmation-response", token, action),
  openLink: (destination) => ipcRenderer.invoke("eu5:open-link", destination),
  restart: () => ipcRenderer.invoke("eu5:restart"),
  onEvent: (fn) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: Parameters<typeof fn>[0],
    ) => fn(value);
    ipcRenderer.on("eu5:event", listener);
    return () => ipcRenderer.removeListener("eu5:event", listener);
  },
};
contextBridge.exposeInMainWorld("eu5", Object.freeze(api));
