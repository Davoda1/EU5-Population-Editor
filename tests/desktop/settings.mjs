// Exercise persisted preferences through the isolated desktop bridge and real sidecar.
import { _electron, expect } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { syntheticGame, population } from "../helpers/synthetic-game.mjs";
import { createDesktopCleanup } from "../helpers/desktop-cleanup.mjs";

await mkdir("build/desktop-tests", { recursive: true });
const work = await mkdtemp(resolve("build/desktop-tests/settings-"));
const profile = join(work, "profile");
const prefFile = join(profile, "preferences.json");
const first = await syntheticGame(join(work, "First installation Ω", "game"));
const second = await syntheticGame(join(work, "Second installation", "game"), population.replace("size=7.001", "size=8.001"));
const projectDir = join(work, "Projects"), exportDir = join(work, "Exports");
await mkdir(projectDir); await mkdir(exportDir);
let app, page, cleanup;
async function launch() {
  const executable = process.env.EU5_QA_EXECUTABLE;
  app = await _electron.launch({
    ...(executable ? { executablePath: resolve(executable) } : {}),
    args: [
      ...(process.env.EU5_QA_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
      "--disable-gpu", `--user-data-dir=${profile}`,
      ...(executable ? [] : [resolve(".")]),
    ], timeout: 30000,
  });
  cleanup = createDesktopCleanup(app);
  page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.eu5));
  await page.evaluate(() => window.eu5.startup()).catch(() => {});
}
const request = (method, params = {}) => page.evaluate(({ method, params }) => window.eu5.request(method, params), { method, params });
const settings = () => page.evaluate(() => window.eu5.settings());
const saveSettings = (changes) => page.evaluate(async (changes) => {
  const { geometry, ...current } = await window.eu5.settings();
  return window.eu5.settings({ ...current, ...changes });
}, changes);
const preferencesFile = async () => JSON.parse(await readFile(prefFile, "utf8"));
const picker = (path, save = false, canceled = false) => app.evaluate(({ dialog }, values) => {
  const { path, save, canceled } = values;
  globalThis.lastPickerDefault = "";
  if (save) dialog.showSaveDialog = async (window, options) => {
    globalThis.lastPickerDefault = options.defaultPath;
    return { canceled, filePath: canceled ? undefined : path };
  };
  else dialog.showOpenDialog = async (window, options) => {
    globalThis.lastPickerDefault = options.defaultPath;
    return { canceled, filePaths: canceled ? [] : [path] };
  };
}, { path, save, canceled });
const close = async () => {
  const closed = app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  await cleanup();
  app = null;
};
const exportOptions = { name: "Settings verification", id: "settings-verification", version: "1.0.0", supported_game_version: "1.4.5", zip: false, acknowledge_unverified_version: false };

try {
  await launch();
  const defaults = await settings();
  expect(defaults.autoLoad && defaults.rememberWindow && defaults.rememberFolders).toBe(true);
  expect(defaults.gameDir).toBe("");
  expect(await request("status").catch(() => null)).toBe(null);

  await picker(dirname(first));
  expect(await page.evaluate(() => window.eu5.browseGameDirectory())).toBe(dirname(first));
  expect((await settings()).gameDir).toBe("");
  await saveSettings({ gameDir: dirname(first), gameVersion: "v1.4.6", autoLoad: false, theme: "dark" });
  expect((await page.evaluate((path) => window.eu5.installationVersion(path), first)).version).toBe("1.4.6");
  await page.evaluate(() => window.eu5.previewTheme("auto"));
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe("system");
  expect((await preferencesFile()).theme).toBe("dark");
  await page.evaluate(() => window.eu5.previewTheme("dark"));
  expect(await request("status").catch(() => null)).toBe(null);
  const initial = await request("load_saved_game");
  expect((await page.evaluate(() => window.eu5.gameVersion())).version).toBe("1.4.6");

  await saveSettings({ gameDir: second, gameVersion: "1.5.0" });
  expect((await request("status")).fingerprint).toBe(initial.fingerprint);
  expect((await page.evaluate(() => window.eu5.gameVersion())).version).toBe("1.4.6");
  await expect(saveSettings({ gameDir: projectDir })).rejects.toThrow();
  expect((await settings()).gameDir).toBe(second);
  expect((await request("status")).fingerprint).toBe(initial.fingerprint);
  await request("draft_activity", { active: true });
  const pending = request("load_saved_game");
  const confirmation = page.getByRole("dialog").filter({ hasText: "Your current session contains unsaved work." });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await pending).toBe(null);
  expect((await request("status")).fingerprint).toBe(initial.fingerprint);
  expect((await page.evaluate(() => window.eu5.gameVersion())).version).toBe("1.4.6");
  await request("draft_activity", { active: false });

  await saveSettings({ gameDir: first, gameVersion: "1.4.5", autoLoad: true });
  const proposal = await request("preview", { key: "alpha", operation: { kind: "scale", mode: "multiply", value: "2" } });
  await request("apply", { key: "alpha", token: proposal.draft_token });
  await picker(join(projectDir, "Population.eu5popproj"), true);
  await request("save", { saveAs: true });
  await picker(exportDir);
  await request("export", { options: exportOptions });
  expect((await preferencesFile()).projectDir).toBe(projectDir);
  expect((await preferencesFile()).exportDir).toBe(exportDir);
  await picker("", true, true);
  expect(await request("save", { saveAs: true })).toBe(null);
  expect(await app.evaluate(() => globalThis.lastPickerDefault)).toBe(join(projectDir, "Population.eu5popproj"));
  await picker("", false, true);
  expect(await request("export", { options: exportOptions })).toBe(null);
  expect(await app.evaluate(() => globalThis.lastPickerDefault)).toBe(exportDir);

  const requestedNormal = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0], area = screen.getPrimaryDisplay().workArea;
    const bounds = { x: area.x + 10, y: area.y + 10, width: Math.min(1000, area.width - 10), height: Math.min(700, area.height - 10) };
    win.setBounds(bounds);
    return bounds;
  });
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNormalBounds())).toEqual(requestedNormal);
  const normal = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNormalBounds());
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  if (process.platform === "win32") await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  else await page.waitForTimeout(200);
  const maximized = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized());
  if (process.platform === "win32") expect(maximized).toBe(true);
  await close();
  expect((await preferencesFile()).geometry).toEqual({ ...normal, maximized });

  await launch();
  expect((await request("status")).fingerprint).toBe(initial.fingerprint);
  expect((await settings()).theme).toBe("dark");
  expect((await page.evaluate(() => window.eu5.gameVersion())).version).toBe("1.4.5");
  if (maximized) await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  else await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(normal);
  const expectedReset = await app.evaluate(({ BrowserWindow, screen }) => {
    const area = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).workArea;
    const width = Math.min(1440, area.width), height = Math.min(920, area.height);
    return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height };
  });
  await saveSettings({ resetWindow: true });
  expect((await settings()).geometry).toBe(null);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(expectedReset);
  const resetBounds = await app.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()[0].getBounds(), area = screen.getDisplayMatching(bounds).workArea;
    return { bounds, area };
  });
  expect(Math.abs(resetBounds.bounds.x - (resetBounds.area.x + (resetBounds.area.width - resetBounds.bounds.width) / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(resetBounds.bounds.y - (resetBounds.area.y + (resetBounds.area.height - resetBounds.bounds.height) / 2))).toBeLessThanOrEqual(1);
  await saveSettings({ rememberWindow: false, rememberFolders: false, autoLoad: false });
  expect((await preferencesFile()).geometry).toBe(null);
  expect((await preferencesFile()).projectDir).toBe("");
  expect((await preferencesFile()).exportDir).toBe("");
  await picker("", false, true);
  await request("export", { options: exportOptions });
  expect(await app.evaluate(() => globalThis.lastPickerDefault)).toBe(await app.evaluate(({ app }) => app.getPath("documents")));
  await close();
  expect((await preferencesFile()).geometry).toBe(null);

  await launch();
  expect(await request("status").catch(() => null)).toBe(null);
  expect((await settings()).autoLoad).toBe(false);
  await close();

  const stale = await preferencesFile();
  await writeFile(prefFile, JSON.stringify({ ...stale, autoLoad: true, rememberWindow: true, geometry: { x: 50000, y: -50000, width: 4000, height: 3000, maximized: false }, gameDir: join(work, "Removed installation") }));
  await launch();
  expect(await request("status").catch(() => null)).toBe(null);
  const visible = await app.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()[0].getBounds(), area = screen.getDisplayMatching(bounds).workArea;
    return bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height;
  });
  expect(visible).toBe(true);
  await saveSettings({ autoLoad: false });
  expect((await settings()).autoLoad).toBe(false);
  await saveSettings({ gameDir: first, gameVersion: "1.4.5", autoLoad: false });
  expect((await request("load_saved_game")).fingerprint).toBe(initial.fingerprint);
  expect(await readFile(join(first, "main_menu/setup/start/06_pops.txt"), "utf8")).toBe(population);
  await close();
  console.log("PASS: native settings, per-installation versions, failed/cancelled replacement retention, independent folder memory, relaunch/autoload, normal window restoration, reset/disable, offscreen recovery and missing-installation recovery.");
} finally {
  try { if (app) await cleanup(); }
  finally { await rm(work, { recursive: true, force: true }); }
}
