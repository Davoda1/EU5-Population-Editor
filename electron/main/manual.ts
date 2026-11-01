import { app, BrowserWindow, Menu, nativeTheme, screen, session, shell } from "electron";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";
import { MANUAL_HOME, MANUAL_SCHEME, manualExternal, manualResource } from "./manual-paths";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
};
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
type AppTheme = "auto" | "light" | "dark";

export class ManualWindow {
  private window: BrowserWindow | null = null;
  private opening: Promise<void> | null = null;
  private disposed = false;
  private theme: "system" | "light" | "dark";
  private readonly root = app.isPackaged
    ? join(process.resourcesPath, "manual")
    : join(app.getAppPath(), "docs/manual/site");
  private readonly manualSession = session.fromPartition("persist:offline-manual");

  constructor(private readonly owner: BrowserWindow, theme: AppTheme = "auto") {
    this.theme = theme === "light" || theme === "dark" ? theme : "system";
    // Copy buttons need sanitized clipboard writes. Only the focused manual's
    // own main frame receives that capability; clipboard reads and every other
    // permission stay denied, without exposing an application preload or IPC.
    this.manualSession.setPermissionRequestHandler((wc, permission, callback, details) =>
      callback(this.canCopy(wc, permission, details)));
    this.manualSession.setPermissionCheckHandler((wc, permission, _origin, details) =>
      this.canCopy(wc, permission, details));
    this.manualSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*", "file://*/*"] },
      (_details, callback) => callback({ cancel: true }),
    );
    this.manualSession.on("will-download", (event) => event.preventDefault());
    this.manualSession.protocol.handle(MANUAL_SCHEME, async (request) => {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      const candidate = manualResource(this.root, request.url);
      if (!candidate) return new Response("Not found", { status: 404 });
      try {
        const [root, target] = await Promise.all([realpath(this.root), realpath(candidate)]);
        const rel = relative(root, target);
        if (!rel || rel.startsWith("..") || isAbsolute(rel) || !(await stat(target)).isFile())
          return new Response("Not found", { status: 404 });
        const contentType = types[extname(target).toLowerCase()];
        if (!contentType) return new Response("Unsupported resource", { status: 415 });
        let bytes: Uint8Array<ArrayBuffer> | null = null;
        if (request.method !== "HEAD") {
          const content = await readFile(target);
          // The initial theme is data, placed before the external theme script.
          // Only fixed allowlisted strings are injected; there is no preload or
          // renderer access to application preferences, files, or editor IPC.
          bytes = extname(target).toLowerCase() === ".html"
            ? new Uint8Array(Buffer.from(content.toString("utf8").replace(/<head>/i,
              `<head><meta name="eu5-app-theme" content="${this.theme}">`), "utf8"))
            : new Uint8Array(content);
        }
        return new Response(bytes, { headers: {
          "Content-Type": contentType, "Content-Security-Policy": csp,
          "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache",
        } });
      } catch { return new Response("Manual resource unavailable", { status: 404 }); }
    });
    this.owner.once("closed", () => this.destroy());
  }

  async setTheme(theme: AppTheme): Promise<void> {
    this.theme = theme === "light" || theme === "dark" ? theme : "system";
    await this.syncTheme();
  }

  private async syncTheme(): Promise<void> {
    const window = this.window;
    if (this.disposed || !window || window.isDestroyed()) return;
    window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#151c24" : "#f3f6f9");
    if (!manualResource(this.root, window.webContents.getURL())) return;
    // This one-way event carries only appearance, and never reloads the page or
    // disturbs its current chapter, scroll position, search, or editor state.
    await window.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent("eu5-app-theme", { detail: ${JSON.stringify(this.theme)} }));`,
    ).catch(() => { /* A closed/navigating window receives the theme on its next load. */ });
  }

  private canCopy(wc: Electron.WebContents | null, permission: string,
    details: { isMainFrame: boolean; requestingUrl?: string }): boolean {
    const window = this.window;
    return permission === "clipboard-sanitized-write" && !this.disposed &&
      !!window && !window.isDestroyed() && wc === window.webContents &&
      wc.isFocused() && details.isMainFrame &&
      !!manualResource(this.root, details.requestingUrl || "");
  }

  async open(): Promise<void> {
    if (this.disposed || this.owner.isDestroyed()) return;
    if (this.opening) {
      await this.opening;
      this.focus();
      return;
    }
    if (this.window && !this.window.isDestroyed()) { this.focus(); return; }
    // Include file validation in the shared promise so concurrent requests
    // cannot both pass the empty-window check and create separate windows.
    const opening = this.create();
    this.opening = opening;
    try { await opening; }
    finally { if (this.opening === opening) this.opening = null; }
  }

  private focus(): void {
    const window = this.window;
    if (this.disposed || this.owner.isDestroyed() || !window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  }

  private async create(): Promise<void> {
    const home = await readFile(join(this.root, "index.html"), "utf8");
    if (this.disposed || this.owner.isDestroyed()) return;
    if (!home.includes(`content="${app.getVersion()}" name="eu5-manual-version"`) &&
        !home.includes(`name="eu5-manual-version" content="${app.getVersion()}"`))
      throw new Error("The bundled manual is missing or does not match this application version.");
    const area = screen.getDisplayMatching(this.owner.getBounds()).workArea;
    const width = Math.min(1160, area.width), height = Math.min(820, area.height);
    const title = `EU5 Population Editor ${app.getVersion()} — Manual`;
    const window = new BrowserWindow({
      width, height, minWidth: Math.min(680, width), minHeight: Math.min(540, height),
      x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2),
      title, show: false, backgroundColor: nativeTheme.shouldUseDarkColors ? "#151c24" : "#f3f6f9",
      icon: join(app.isPackaged ? process.resourcesPath : app.getAppPath(), "assets", ...(process.platform === "win32" ? ["icon.ico"] : ["icons", "512.png"])),
      webPreferences: { session: this.manualSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
    });
    this.window = window;
    // Reapply after navigation/history restoration in case an Appearance change
    // happened between serving the HTML and creating its new document.
    window.webContents.on("dom-ready", () => { void this.syncTheme(); });
    window.on("page-title-updated", (event) => { event.preventDefault(); window.setTitle(title); });
    window.on("closed", () => { if (this.window === window) this.window = null; });
    const navigate = (url: string) => {
      if (manualResource(this.root, url)) void window.loadURL(url).catch(() => {});
      else if (manualExternal(url)) void shell.openExternal(url).catch(() => {});
    };
    window.webContents.on("will-navigate", (event, url) => {
      if (!manualResource(this.root, url)) { event.preventDefault(); navigate(url); }
    });
    window.webContents.on("will-redirect", (event, url) => {
      if (!manualResource(this.root, url)) event.preventDefault();
    });
    window.webContents.on("will-attach-webview", (event) => event.preventDefault());
    window.webContents.setWindowOpenHandler(({ url }) => { navigate(url); return { action: "deny" }; });
    const history = window.webContents.navigationHistory;
    window.setMenu(Menu.buildFromTemplate([{ label: "Manual", submenu: [
      { label: "Home", accelerator: "Alt+Home", click: () => navigate(MANUAL_HOME) },
      { label: "Back", accelerator: "Alt+Left", click: () => { if (history.canGoBack()) history.goBack(); } },
      { label: "Forward", accelerator: "Alt+Right", click: () => { if (history.canGoForward()) history.goForward(); } },
      { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" }, { role: "close" },
    ] }]));
    try {
      await window.loadURL(MANUAL_HOME);
      if (this.disposed || this.owner.isDestroyed() || window.isDestroyed()) return;
      if (this.window === window) this.focus();
    } catch (error) {
      const alreadyClosed = window.isDestroyed();
      // A failed or canceled older load must never close a newer window.
      if (!alreadyClosed) window.destroy();
      if (this.window === window) this.window = null;
      if (!this.disposed && !this.owner.isDestroyed() && !alreadyClosed) throw error;
    }
  }

  destroy(): void {
    this.disposed = true;
    const window = this.window;
    this.window = null;
    if (window && !window.isDestroyed()) window.destroy();
  }
}
