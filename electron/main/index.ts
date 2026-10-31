import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  Menu,
  shell,
  screen,
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
  installationPath,
  DEFAULT_GAME_VERSION,
} from "./game-version-settings";
import { methods, Method, Status, ConfirmationPrompt, AppSettings, AppSettingsUpdate } from "../../src/types/api";
import { defaultPreferences, readPreferences, windowBounds, MIN_WINDOW_SIZE, Preferences } from "./app-settings";
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
let prefs: Preferences = defaultPreferences();
const prefPath = () => join(app.getPath("userData"), "preferences.json");
let preferenceWrites = Promise.resolve();
async function savePrefs(value: Preferences = prefs) {
  const serialized = JSON.stringify(value);
  const operation = preferenceWrites.catch(() => {}).then(async () => {
    const path = prefPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path + ".tmp", serialized, "utf8");
    await rename(path + ".tmp", path);
  });
  preferenceWrites = operation;
  await operation;
}
function captureWindow() {
  if (!prefs.rememberWindow) { prefs.geometry = null; return; }
  prefs.geometry = { ...window.getNormalBounds(), maximized: window.isMaximized() };
}
function defaultDirectory(kind: "projectDir" | "exportDir") {
  return (prefs.rememberFolders && prefs[kind]) || app.getPath("documents");
}
async function rememberDirectory(kind: "projectDir" | "exportDir", path: string) {
  if (!prefs.rememberFolders) return;
  prefs[kind] = path;
  try { await savePrefs(); }
  catch { emit("operation-error", { message: "The operation completed, but its last-used folder could not be saved." }); }
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
      defaultPath: join(defaultDirectory("projectDir"), "Population.eu5popproj"),
      filters: [{ name: "Population project", extensions: ["eu5popproj"] }],
    });
    if (result.canceled || !result.filePath) return null;
    path = result.filePath;
  }
  const result = await core.request<Status>("save", { path });
  projectPath = path;
  await rememberDirectory("projectDir", dirname(path));
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
    prefs = readPreferences(JSON.parse(await readFile(prefPath(), "utf8")));
  } catch { /* first run or corrupt preferences */ }
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
  const initialBounds = windowBounds(prefs.geometry, screen.getAllDisplays().map((display) => display.workArea), screen.getPrimaryDisplay().workArea);
  window = new BrowserWindow({
    ...initialBounds,
    minWidth: Math.min(MIN_WINDOW_SIZE.width, initialBounds.width),
    minHeight: Math.min(MIN_WINDOW_SIZE.height, initialBounds.height),
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
  if (prefs.rememberWindow && prefs.geometry?.maximized) window.maximize();
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
  async function settingsSnapshot(): Promise<AppSettings> {
    let gameVersion = DEFAULT_GAME_VERSION;
    if (prefs.gameDir) {
      try { gameVersion = (await gameVersions.forPath(prefs.gameDir)).version; }
      catch { /* Missing saved installations remain editable in Settings. */ }
    }
    return {
      theme: prefs.theme, gameDir: prefs.gameDir, gameVersion,
      autoLoad: prefs.autoLoad, rememberWindow: prefs.rememberWindow,
      rememberFolders: prefs.rememberFolders, geometry: prefs.geometry,
    };
  }
  async function loadInstallation(path: string): Promise<Status> {
    const prepared = await gameVersions.prepare(path);
    const result = await core.request<Status>("load_game", { path });
    gameVersions.usePrepared(prepared);
    hasProject = true;
    projectPath = "";
    rendererDrafts = false;
    pendingGameDir = "";
    prefs.gameDir = path;
    try { await savePrefs(); }
    catch { emit("operation-error", { message: "Game data loaded, but the installation preference could not be saved." }); }
    return result;
  }
  let startupAttempt: Promise<Status | null> | undefined;
  ipcMain.handle("eu5:startup", (event) => {
    sender(event);
    if (!startupAttempt) startupAttempt = (async () => {
      if (!prefs.autoLoad || !prefs.gameDir || hasProject || operationActive) return null;
      operationActive = true;
      try { return await loadInstallation(prefs.gameDir); }
      finally { operationActive = false; }
    })();
    return startupAttempt;
  });
  ipcMain.handle("eu5:browse-game-directory", async (event) => {
    sender(event);
    if (operationActive) throw new Error("Finish the current operation or confirmation first");
    operationActive = true;
    try { return await browseDir(prefs.gameDir || (await candidates())[0]); }
    finally { operationActive = false; }
  });
  ipcMain.handle("eu5:installation-version", async (event, path) => {
    sender(event);
    if (typeof path !== "string") throw new Error("Enter an installation directory.");
    return gameVersions.forPath(path);
  });
  ipcMain.handle("eu5:preview-theme", (event, theme) => {
    sender(event);
    if (!["auto", "light", "dark"].includes(theme)) throw new Error("Invalid theme");
    nativeTheme.themeSource = theme === "auto" ? "system" : theme;
  });
  ipcMain.handle("eu5:settings", async (event, value?: AppSettingsUpdate) => {
    sender(event);
    if (value === undefined) return settingsSnapshot();
    if (operationActive) throw new Error("Finish the current operation or confirmation first");
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        !["auto", "light", "dark"].includes(value.theme) ||
        ["autoLoad", "rememberWindow", "rememberFolders"].some((key) => typeof value[key as keyof AppSettingsUpdate] !== "boolean") ||
        (value.resetWindow !== undefined && typeof value.resetWindow !== "boolean") || typeof value.gameDir !== "string")
      throw new Error("Invalid application settings.");
    const path = value.gameDir.trim() ? installationPath(value.gameDir) : "";
    const version = normalizeGameVersion(value.gameVersion);
    operationActive = true;
    try {
      // Validate a changed installation in isolation, preserving the active session.
      if (path && path !== prefs.gameDir) {
        const probe = new CoreClient(executable);
        try { await probe.request("load_game", { path }); }
        finally { probe.stop(); }
      }
      const next: Preferences = {
        ...prefs, theme: value.theme, gameDir: path, autoLoad: value.autoLoad,
        rememberWindow: value.rememberWindow, rememberFolders: value.rememberFolders,
        geometry: !value.rememberWindow || value.resetWindow ? null : prefs.geometry,
        projectDir: value.rememberFolders ? prefs.projectDir : "",
        exportDir: value.rememberFolders ? prefs.exportDir : "",
      };
      const versionChanged = path && version !== (await gameVersions.forPath(path)).version;
      if (path && (path !== prefs.gameDir || versionChanged))
        await gameVersions.saveWithPreferences(path, version, () => savePrefs(next), () => savePrefs(prefs));
      else await savePrefs(next);
      prefs = next;
      nativeTheme.themeSource = prefs.theme === "auto" ? "system" : prefs.theme;
      if (value.resetWindow) {
        const area = screen.getDisplayMatching(window.getBounds()).workArea;
        if (window.isMaximized()) {
          const restored = await new Promise<boolean>((resolve) => {
            const finished = () => { clearTimeout(timer); window.removeListener("unmaximize", finished); resolve(true); };
            const timer = setTimeout(() => {
              window.removeListener("unmaximize", finished);
              resolve(!window.isMaximized());
            }, 3000);
            window.once("unmaximize", finished);
            window.unmaximize();
          });
          if (!restored) {
            emit("operation-error", { message: "Settings were saved. The window could not be reset now; its default layout will be used at the next startup." });
            return settingsSnapshot();
          }
        }
        const bounds = windowBounds(null, [area], area);
        window.setMinimumSize(Math.min(MIN_WINDOW_SIZE.width, area.width), Math.min(MIN_WINDOW_SIZE.height, area.height));
        window.setBounds(bounds);
      }
      return settingsSnapshot();
    } finally { operationActive = false; }
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
          ["load_game", "load_saved_game", "new_project", "open", "legacy_commit"].includes(
            method,
          ) &&
          !(await confirmReplace())
        )
          return null;
        if (method === "load_saved_game") {
          if (!prefs.gameDir) throw new Error("Save an installation directory in Settings first.");
          return await loadInstallation(prefs.gameDir);
        }
        if (method === "load_game" || method === "upgrade_plan") {
          const start =
            prefs.gameDir || (await candidates())[0] || app.getPath("documents");
          const path = await browseDir(start);
          if (!path) return null;
          params.path = path;
          if (method === "load_game") return await loadInstallation(path);
        }
        if (
          method === "open" ||
          method === "legacy_plan" ||
          method === "import_mod_plan"
        ) {
          const r = await dialog.showOpenDialog(window, {
            defaultPath: defaultDirectory("projectDir"),
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
          const path = await browseDir(defaultDirectory("exportDir"));
          if (!path) return null;
          params.path = path;
        }
        if (method === "change_report" || method === "upgrade_report") {
          const format = input.format;
          if (!["json", "md", "csv"].includes(String(format)))
            throw new Error("Invalid report format");
          const r = await dialog.showSaveDialog(window, {
            defaultPath: join(
              defaultDirectory("projectDir"),
              `${method === "change_report" ? "Changes" : "Migration"}.${format}`,
            ),
          });
          if (r.canceled || !r.filePath) return null;
          params.path = r.filePath;
        }
        if (method === "map_index")
          params.cache = join(app.getPath("userData"), "map-cache");
        const preparedUpgrade = method === "upgrade_commit" && pendingGameDir
          ? await gameVersions.prepare(pendingGameDir) : null;
        const result = await core.request(method, params);
        if (method === "open") {
          projectPath = String(params.path);
          await rememberDirectory("projectDir", dirname(projectPath));
        }
        if (
          method === "new_project" ||
          method === "legacy_commit"
        )
          projectPath = "";
        if (method === "export") await rememberDirectory("exportDir", String(params.path));
        if (["legacy_plan", "import_mod_plan", "change_report", "upgrade_report"].includes(method))
          await rememberDirectory("projectDir", dirname(String(params.path)));
        if (method === "upgrade_plan") pendingGameDir = String(params.path);
        if (method === "upgrade_commit" && pendingGameDir && preparedUpgrade) {
          prefs.gameDir = pendingGameDir;
          gameVersions.usePrepared(preparedUpgrade);
          pendingGameDir = "";
          try { await savePrefs(); }
          catch { emit("operation-error", { message: "Migration completed, but the installation preference could not be saved." }); }
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
      if (operationActive) throw new Error("Finish the current operation or confirmation first");
      operationActive = true;
      try {
        const next = { ...prefs, theme };
        await savePrefs(next);
        prefs = next;
        nativeTheme.themeSource = theme === "auto" ? "system" : theme;
      } finally { operationActive = false; }
    }
    return { theme: prefs.theme };
  });
  ipcMain.handle("eu5:game-version", async (event, value) => {
    sender(event);
    if (value === undefined) return gameVersions.current();
    if (operationActive) throw new Error("Finish the current operation or confirmation first");
    operationActive = true;
    try { return await gameVersions.set(value); }
    finally { operationActive = false; }
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
        captureWindow();
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
