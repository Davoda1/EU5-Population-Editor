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
  settings: (value) => ipcRenderer.invoke("eu5:settings", value),
  previewTheme: (theme) => ipcRenderer.invoke("eu5:preview-theme", theme),
  browseGameDirectory: () => ipcRenderer.invoke("eu5:browse-game-directory"),
  installationVersion: (path) => ipcRenderer.invoke("eu5:installation-version", path),
  startup: () => ipcRenderer.invoke("eu5:startup"),
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
