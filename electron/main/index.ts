import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  Menu,
  shell,
} from "electron";
import { mkdirSync } from "node:fs";
import { ConfirmationController } from "./confirmation";
import { externalLink } from "./external-links";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { CoreClient } from "./core-client";
import { candidates } from "./discovery";
import {
  GameVersionSettings,
  normalizeGameVersion,
} from "./game-version-settings";
import { methods, Method, Status, ConfirmationPrompt } from "../../src/types/api";
app.setName("eu5-population-editor");
if (process.platform === "linux") app.commandLine.appendSwitch("class", "eu5-population-editor");
// A stable directory independent of the display name. Respect explicit profile
// overrides used by isolated desktop tests and administrator-managed launches.
const userDataPath = app.commandLine.getSwitchValue("user-data-dir") ||
  join(app.getPath("appData"), "eu5-population-editor");
mkdirSync(userDataPath, { recursive: true });
app.setPath("userData", userDataPath);
let window: BrowserWindow;
let core: CoreClient;
let projectPath = "";
let closing = false;
let rendererDrafts = false;
let pendingGameDir = "";
let hasProject = false;
let operationActive = false;
interface Preferences {
  theme: "auto" | "light" | "dark";
  width: number;
  height: number;
  gameDir: string;
  projectDir: string;
}
let prefs: Preferences = {
  theme: "auto",
  width: 1440,
  height: 920,
  gameDir: "",
  projectDir: "",
};
const prefPath = () => join(app.getPath("userData"), "preferences.json");
async function savePrefs() {
  const path = prefPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path + ".tmp", JSON.stringify(prefs));
  await rename(path + ".tmp", path);
}
function sender(event: Electron.IpcMainInvokeEvent) {
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("Untrusted IPC sender");
}
function emit(event: string, data: Record<string, unknown>) {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    window.webContents.send("eu5:event", { event, data });
}
async function saveProject(saveAs = false): Promise<Status | null> {
  let path = projectPath;
  if (saveAs || !path) {
    const result = await dialog.showSaveDialog(window, {
      defaultPath: join(prefs.projectDir || app.getPath("documents"), "Population.eu5popproj"),
      filters: [{ name: "Population project", extensions: ["eu5popproj"] }],
    });
    if (result.canceled || !result.filePath) return null;
    path = result.filePath;
  }
  const result = await core.request<Status>("save", { path });
  projectPath = path;
  prefs.projectDir = dirname(path);
  await savePrefs();
  emit("project-saved", { status: result });
  return result;
}
const confirmations = new ConfirmationController(
  (prompt, token) => emit(prompt ? "confirmation" : "confirmation-closed", prompt ? { ...prompt } : { token }),
  async () => (await saveProject()) !== null,
);
async function confirmReplace(reason: ConfirmationPrompt["reason"] = "replace") {
  if (!hasProject && !rendererDrafts) return true;
  try {
    const state = await core.request<Status>("status");
    if (!state.dirty && !state.drafts && !rendererDrafts) return true;
    return await confirmations.ask({ reason, hasDrafts: !!state.drafts || rendererDrafts, canSave: true, unavailable: false });
  } catch {
    // A failed status request must never be mistaken for an empty session.
    return await confirmations.ask({ reason, hasDrafts: rendererDrafts, canSave: false, unavailable: true });
  }
}
async function browseDir(defaultPath?: string) {
  const r = await dialog.showOpenDialog(window, {
    title: "Select EU5 installation, game folder, or output folder",
    defaultPath: defaultPath || app.getPath("documents"),
    properties: ["openDirectory"],
  });
  return r.canceled ? null : r.filePaths[0];
}
app.whenReady().then(async () => {
  const gameVersions = new GameVersionSettings(
    join(app.getPath("userData"), "game-versions.json"),
  );
  try {
    const p = JSON.parse(await readFile(prefPath(), "utf8"));
    prefs = {
      ...prefs,
      theme: ["auto", "light", "dark"].includes(p.theme) ? p.theme : "auto",
      width: Math.max(960, Math.min(3840, Number(p.width) || 1440)),
      height: Math.max(680, Math.min(2160, Number(p.height) || 920)),
      gameDir: typeof p.gameDir === "string" ? p.gameDir : "",
      projectDir: typeof p.projectDir === "string" ? p.projectDir : "",
    };
  } catch {
    /* first run or corrupt preferences */
  }
  nativeTheme.themeSource = prefs.theme === "auto" ? "system" : prefs.theme;
  const executable = app.isPackaged
    ? join(
        process.resourcesPath,
        "core",
        process.platform === "win32"
          ? "eu5-population-core.exe"
          : "eu5-population-core",
      )
    : join(
        app.getAppPath(),
        "build",
        "sidecar",
        process.platform === "win32"
          ? "eu5-population-core.exe"
          : "eu5-population-core",
      );
  core = new CoreClient(executable);
  if (process.platform === "win32") app.setAppUserModelId("io.github.davoda1.eu5-population-editor");
  window = new BrowserWindow({
    width: prefs.width,
    height: prefs.height,
    minWidth: 960,
    minHeight: 680,
    title: "EU5 Population & Demographics Editor",
    icon: join(app.isPackaged ? process.resourcesPath : app.getAppPath(), "assets", ...(process.platform === "win32" ? ["icon.ico"] : ["icons", "512.png"])),
    backgroundColor: "#151c24",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.on("render-process-gone", () => confirmations.abort());
  window.webContents.on("destroyed", () => confirmations.abort());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e) => e.preventDefault());
  window.webContents.on("will-attach-webview", (e) => e.preventDefault());
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );
  core.on("event", (event) => {
    if (!window.isDestroyed()) window.webContents.send("eu5:event", event);
  });
  ipcMain.handle(
    "eu5:request",
    async (event, method: Method, input: Record<string, unknown> = {}) => {
      sender(event);
      if (!methods.includes(method)) throw new Error("Unsupported IPC method");
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("Invalid IPC parameters");
      if (method === "draft_activity") {
        rendererDrafts = input.active === true;
        return true;
      }
      const readOnly = ["status", "locations", "location", "map_tile", "map_hit", "validate", "select"].includes(method);
      if (!readOnly && operationActive) throw new Error("Finish the current operation or confirmation first");
      if (!readOnly) operationActive = true;
      try {
        const params = { ...input };
        delete params.path;
        delete params.cache;
        if (
          ["load_game", "new_project", "open", "legacy_commit"].includes(
            method,
          ) &&
          !(await confirmReplace())
        )
          return null;
        if (method === "load_game" || method === "upgrade_plan") {
          const start =
            prefs.gameDir || (await candidates())[0] || app.getPath("documents");
          const path = await browseDir(start);
          if (!path) return null;
          params.path = path;
        }
        if (
          method === "open" ||
          method === "legacy_plan" ||
          method === "import_mod_plan"
        ) {
          const r = await dialog.showOpenDialog(window, {
            defaultPath: prefs.projectDir || app.getPath("documents"),
            properties: ["openFile"],
            filters: [
              {
                name: "Population project",
                extensions:
                  method === "open"
                    ? ["eu5popproj"]
                    : method === "import_mod_plan"
                      ? ["txt"]
                      : ["json"],
              },
            ],
          });
          if (r.canceled) return null;
          params.path = r.filePaths[0];
        }
        if (method === "save") return await saveProject(!!input.saveAs);
        if (method === "export") {
          const options = input.options as Record<string, unknown> | undefined;
          if (!options || typeof options !== "object" || Array.isArray(options))
            throw new Error("Invalid export options");
          // A manually supplied version is metadata only; core validation still runs.
          params.options = {
            ...options,
            supported_game_version: normalizeGameVersion(options.supported_game_version),
          };
          const path = await browseDir(prefs.projectDir);
          if (!path) return null;
          params.path = path;
        }
        if (method === "change_report" || method === "upgrade_report") {
          const format = input.format;
          if (!["json", "md", "csv"].includes(String(format)))
            throw new Error("Invalid report format");
          const r = await dialog.showSaveDialog(window, {
            defaultPath: join(
              prefs.projectDir || app.getPath("documents"),
              `${method === "change_report" ? "Changes" : "Migration"}.${format}`,
            ),
          });
          if (r.canceled || !r.filePath) return null;
          params.path = r.filePath;
        }
        if (method === "map_index")
          params.cache = join(app.getPath("userData"), "map-cache");
        const result = await core.request(method, params);
        if (method === "open") {
          projectPath = String(params.path);
          prefs.projectDir = dirname(projectPath);
          await savePrefs();
        }
        if (
          method === "new_project" ||
          method === "load_game" ||
          method === "legacy_commit"
        )
          projectPath = "";
        if (method === "load_game") {
          hasProject = true;
          prefs.gameDir = String(params.path);
          await gameVersions.activate(prefs.gameDir);
          pendingGameDir = "";
          await savePrefs();
        }
        if (method === "upgrade_plan") pendingGameDir = String(params.path);
        if (method === "upgrade_commit" && pendingGameDir) {
          prefs.gameDir = pendingGameDir;
          await gameVersions.activate(prefs.gameDir);
          pendingGameDir = "";
          await savePrefs();
        }
        return result;
      } finally {
        if (!readOnly) operationActive = false;
      }
    },
  );
  ipcMain.handle("eu5:preferences", async (event, theme) => {
    sender(event);
    if (theme !== undefined) {
      if (!["auto", "light", "dark"].includes(theme))
        throw new Error("Invalid theme");
      prefs.theme = theme;
      nativeTheme.themeSource = theme === "auto" ? "system" : theme;
      await savePrefs();
    }
    return { theme: prefs.theme };
  });
  ipcMain.handle("eu5:game-version", async (event, value) => {
    sender(event);
    return value === undefined ? gameVersions.current() : gameVersions.set(value);
  });
  ipcMain.handle("eu5:open-link", async (event, destination) => {
    sender(event);
    await shell.openExternal(externalLink(destination));
  });
  ipcMain.handle("eu5:confirmation-response", async (event, token, action) => {
    sender(event);
    await confirmations.respond(token, action);
  });
  ipcMain.handle("eu5:restart", async (event) => {
    sender(event);
    if (operationActive) return false;
    operationActive = true;
    try {
      if (!(await confirmReplace("restart"))) return false;
      core.stop();
      core.start();
      projectPath = "";
      pendingGameDir = "";
      rendererDrafts = false;
      hasProject = false;
      gameVersions.clear();
      return true;
    } finally { operationActive = false; }
  });
  window.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    if (operationActive) return;
    operationActive = true;
    void (async () => {
      try {
        if (!(await confirmReplace("exit"))) return;
        [prefs.width, prefs.height] = window.getSize();
        await savePrefs();
        closing = true;
        window.close();
      } catch (error) {
        emit("operation-error", { message: error instanceof Error ? error.message : String(error) });
      } finally { operationActive = false; }
    })();
  });
  await window.loadURL(
    pathToFileURL(join(__dirname, "../renderer/index.html")).href,
  );
});
app.on("window-all-closed", () => {
  core?.stop();
  app.quit();
});
