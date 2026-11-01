// Real Electron windows and the packaged manual protocol. Only native picker
// answers and the operating-system external-browser callback are mocked.
import { _electron, expect } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { syntheticGame } from "../helpers/synthetic-game.mjs";
import { createDesktopCleanup } from "../helpers/desktop-cleanup.mjs";

const root = resolve(".");
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await mkdir("build/desktop-tests", { recursive: true });
const work = await mkdtemp(resolve("build/desktop-tests/manual-"));
const game = await syntheticGame(join(work, "Game Ω"));
const profile = join(work, "profile");
await mkdir(profile);
await writeFile(join(profile, "preferences.json"), JSON.stringify({ theme: "dark" }));
const executablePath = process.env.EU5_QA_EXECUTABLE;
const app = await _electron.launch({
  ...(executablePath ? { executablePath: resolve(executablePath) } : {}),
  args: [
    ...(process.env.EU5_QA_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
    "--disable-gpu", `--user-data-dir=${profile}`,
    ...(executablePath ? [] : [root]),
  ],
  timeout: 30000,
});
const cleanup = createDesktopCleanup(app);
const editor = await app.firstWindow();
const errors = [];
editor.on("pageerror", (error) => errors.push(String(error)));
const request = (method, params = {}) => editor.evaluate(({ method, params }) => window.eu5.request(method, params), { method, params });
const countWindows = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
const manualHome = "eu5-manual://manual/index.html";
const settingsDialog = editor.getByRole("dialog", { name: "Settings", exact: true });
const openAppearance = async () => {
  await editor.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settingsDialog).toBeVisible();
};
const themeName = (theme) => `${theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"} theme`;

try {
  await app.evaluate(({ dialog, shell }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    globalThis.manualExternalCalls = [];
    shell.openExternal = async (url) => { globalThis.manualExternalCalls.push(url); };
  }, game);
  await editor.getByRole("button", { name: "Select EU5 game data" }).click();
  await editor.getByRole("button", { name: /Alpha City/ }).click();
  await editor.locator("tbody tr").filter({ hasText: "7,001" }).first().getByRole("button", { name: "Edit", exact: true }).click();
  await editor.getByLabel("Draft value").fill("8001");
  await editor.getByRole("button", { name: "Review draft", exact: true }).click();
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  await editor.locator("tbody tr").filter({ hasText: "peasants" }).first().getByRole("button", { name: "Edit", exact: true }).click();
  await editor.getByLabel("Draft value").fill("12345");
  const originalState = { status: await request("status"), location: await request("location", { key: "alpha" }) };

  // Register the event before triggering the requests. Concurrent calls must
  // share even the asynchronous file-validation stage of opening the manual.
  const opened = app.waitForEvent("window");
  await editor.evaluate(() => Promise.all(Array.from({ length: 5 }, () => window.eu5.openLink("manual"))));
  const manual = await opened;
  manual.on("pageerror", (error) => errors.push(String(error)));
  await expect(manual).toHaveURL(manualHome);
  await expect(manual.locator('meta[name="eu5-manual-version"]')).toHaveAttribute("content", version);
  await expect(manual.locator("body")).toHaveAttribute("data-edition", "offline");
  expect(await countWindows()).toBe(2);
  const manualWindowId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith("eu5-manual:")).id);
  await editor.evaluate(() => window.eu5.openLink("manual"));
  expect(await countWindows()).toBe(2);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith("eu5-manual:")).id)).toBe(manualWindowId);

  const preferences = await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).webContents.getLastWebPreferences(), manualWindowId);
  expect(preferences.nodeIntegration).toBe(false);
  expect(preferences.contextIsolation).toBe(true);
  expect(preferences.sandbox).toBe(true);
  expect(preferences.webSecurity).toBe(true);
  expect(preferences.preload || "").toBe("");
  expect(await manual.evaluate(() => ({ bridge: typeof window.eu5, require: typeof window.require, process: typeof window.process }))).toEqual({ bridge: "undefined", require: "undefined", process: "undefined" });

  // The manual has no renderer IPC primitive. Additionally exercise the real
  // registered handlers with this actual window's identity, rather than the
  // editor's identity, to verify the main-process sender guard independently.
  const senderErrors = await app.evaluate(async ({ BrowserWindow, ipcMain }, id) => {
    const sender = BrowserWindow.fromId(id).webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    const handlers = ipcMain._invokeHandlers;
    if (!(handlers instanceof Map)) throw new Error("Electron IPC handler registry unavailable for sender-isolation verification");
    const outcomes = [];
    for (const [channel, args] of [["eu5:request", ["status", {}]], ["eu5:settings", []], ["eu5:open-link", ["repository"]]]) {
      try { await handlers.get(channel)(event, ...args); outcomes.push("UNEXPECTEDLY ALLOWED"); }
      catch (error) { outcomes.push(String(error)); }
    }
    return outcomes;
  }, manualWindowId);
  expect(senderErrors).toHaveLength(3);
  expect(senderErrors.every((message) => message.includes("Untrusted IPC sender"))).toBe(true);

  const expectTheme = async (theme) => {
    await expect(manual.locator("html")).toHaveAttribute("data-preference", theme);
    const actual = theme === "system"
      ? await manual.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
    await expect(manual.locator("html")).toHaveAttribute("data-theme", actual);
    await expect(manual.locator(".theme-toggle")).toHaveCount(0);
    await expect(manual.locator(`.theme-screenshot:not(.appearance-screenshot) .fullsize-${actual}`).first()).toBeVisible();
    await expect(manual.locator(`.theme-screenshot:not(.appearance-screenshot) .fullsize-${actual === "dark" ? "light" : "dark"}`).first()).not.toBeVisible();
  };
  const chooseTheme = async (theme) => {
    await openAppearance();
    await settingsDialog.getByRole("radio", { name: themeName(theme), exact: true }).locator("..").click();
    await expectTheme(theme);
    await settingsDialog.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(settingsDialog).not.toBeVisible();
    await expectTheme(theme);
  };
  await expectTheme("dark");
  // Old independent manual preferences must not override application Appearance.
  await manual.evaluate(() => localStorage.setItem("eu5-population-editor-manual-theme", "light"));
  await manual.reload();
  await expectTheme("dark");
  const position = await manual.evaluate(() => { window.scrollTo({ top: 240, behavior: "instant" }); return window.scrollY; });
  await openAppearance();
  await settingsDialog.getByRole("radio", { name: "Light theme", exact: true }).locator("..").click();
  await expectTheme("light");
  expect((await editor.evaluate(() => window.eu5.settings())).theme).toBe("dark");
  expect(await manual.evaluate(() => window.scrollY)).toBe(position);
  await settingsDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expectTheme("dark");
  await openAppearance();
  await settingsDialog.getByRole("radio", { name: "System theme", exact: true }).locator("..").click();
  await expectTheme("system");
  await settingsDialog.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(settingsDialog).not.toBeVisible();
  expect((await editor.evaluate(() => window.eu5.settings())).theme).toBe("auto");
  // Emulate an OS color-scheme change while System remains selected.
  await manual.emulateMedia({ colorScheme: "dark" });
  await expect(manual.locator("html")).toHaveAttribute("data-theme", "dark");
  await manual.emulateMedia({ colorScheme: "light" });
  await expect(manual.locator("html")).toHaveAttribute("data-theme", "light");
  await manual.emulateMedia({ colorScheme: null });
  await expectTheme("system");
  await chooseTheme("dark");
  await manual.evaluate(() => window.scrollTo(0, 0));
  const chapters = await manual.locator('nav[aria-label="Chapters"] a').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(chapters).toHaveLength(15);
  expect(new Set(chapters).size).toBe(15);
  const screenshotSources = new Set();
  for (const chapter of [...chapters.slice(1), chapters[0]]) {
    await manual.locator('nav[aria-label="Chapters"]').locator(`a[href="${chapter}"]`).click();
    await expect(manual).toHaveURL(new URL(chapter, manualHome).href);
    await expect(manual.locator("article h1")).toBeVisible();
    await expect(manual.locator("body")).toHaveAttribute("data-page", chapter === "index.html" ? "overview" : chapter.replace(/\.html$/, ""));
    await expect(manual.locator('meta[name="eu5-manual-version"]')).toHaveAttribute("content", version);
    await expect(manual.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await manual.evaluate(() => window.MANUAL_SEARCH.length)).toBe(15);
    await manual.locator("article img").evaluateAll((images) => images.forEach((image) => { image.loading = "eager"; }));
    await expect.poll(() => manual.locator("article img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    for (const source of await manual.locator("article img").evaluateAll((images) => images.map((image) => image.src))) {
      expect(source.startsWith("eu5-manual://manual/assets/")).toBe(true);
      screenshotSources.add(source);
    }
  }
  expect(screenshotSources.size).toBeGreaterThan(0);

  // Appearance follows both the application preference and the system's
  // resolved colors. Other illustrations continue to follow colors alone.
  await manual.locator('nav[aria-label="Chapters"] a[href="settings.html"]').click();
  const appearance = manual.locator(".appearance-screenshot");
  for (const scheme of ["light", "dark"]) {
    await manual.emulateMedia({ colorScheme: scheme });
    for (const preference of ["system", "light", "dark"]) {
      await chooseTheme(preference);
      const color = preference === "system" ? scheme : preference;
      const name = `settings-appearance-${preference === "system" ? "system-" : ""}${color}.png`;
      await expect(manual.locator("html")).toHaveAttribute("data-theme", color);
      const picture = appearance.locator("img:visible");
      const link = appearance.locator("figcaption a:visible");
      await expect(picture).toHaveCount(1);
      await expect(link).toHaveCount(1);
      await expect(picture).toHaveAttribute("src", `assets/${name}?v=${version}`);
      await expect(link).toHaveAttribute("href", `assets/${name}?v=${version}`);
      await picture.scrollIntoViewIfNeeded();
      await expect.poll(() => picture.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect(manual.locator(".theme-screenshot:not(.appearance-screenshot) img:visible").first())
        .toHaveAttribute("src", `assets/settings-game-${color}.png?v=${version}`);
    }
    await chooseTheme("system");
    await manual.reload();
    await expect(manual.locator("html")).toHaveAttribute("data-preference", "system");
    await expect(appearance.locator("img:visible")).toHaveAttribute("src", `assets/settings-appearance-system-${scheme}.png?v=${version}`);
  }
  await manual.emulateMedia({ colorScheme: null });
  await chooseTheme("dark");

  // The manual's Copy buttons require sanitized writes, while clipboard reads
  // must remain unavailable to its renderer.
  await manual.locator('nav[aria-label="Chapters"] a[href="installation.html"]').click();
  const example = await manual.locator("pre code").first().textContent();
  const copy = manual.getByRole("button", { name: "Copy code to clipboard" }).first();
  await copy.click();
  await expect(copy).toHaveText("Copied");
  // Windows' native clipboard represents line endings as CRLF, while DOM text
  // uses LF. Normalize that transport difference without trimming code content.
  const copiedCode = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copiedCode.replace(/\r\n/g, "\n")).toBe(example);
  expect(await manual.evaluate(async () => {
    try { await navigator.clipboard.readText(); return false; }
    catch { return true; }
  })).toBe(true);

  await manual.keyboard.press("Control+k");
  await expect(manual.getByRole("dialog", { name: "Search the manual" })).toBeVisible();
  await manual.getByLabel("Search manual pages").fill("migration");
  const searchResult = manual.locator("#search-results a").first();
  await expect(searchResult).toBeVisible();
  const destination = await searchResult.getAttribute("href");
  await searchResult.click();
  await expect(manual).toHaveURL(new URL(destination, manualHome).href);
  await expect(manual.locator("article h1")).toBeVisible();
  await expect(manual.locator("#search-dialog")).not.toBeVisible();
  await manual.getByRole("link", { name: "EU5 Population Editor manual home", exact: true }).click();
  await expect(manual).toHaveURL(manualHome);

  // target=_blank screenshot links intentionally reuse the isolated manual
  // window; they must not create another window or launch an external browser.
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme);
    const fullSize = manual.locator(`a.fullsize-${theme}`).first();
    await expect(fullSize).toBeVisible();
    const imageUrl = new URL(await fullSize.getAttribute("href"), manualHome).href;
    await fullSize.click();
    await expect(manual).toHaveURL(imageUrl);
    await expect.poll(() => manual.evaluate(() => document.images.length > 0 && [...document.images].every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    expect(await countWindows()).toBe(2);
    await manual.goBack();
    await expect(manual).toHaveURL(manualHome);
    await expect(manual.locator("html")).toHaveAttribute("data-theme", theme);
  }
  await manual.screenshot({ path: "build/desktop-manual.png" });

  expect(await manual.evaluate(async () => {
    try { await fetch("https://example.invalid/offline-manual-check"); return false; }
    catch { return true; }
  })).toBe(true);
  const blockedNetwork = await app.evaluate(async ({ BrowserWindow }, id) => {
    try { await BrowserWindow.fromId(id).webContents.session.fetch("https://example.invalid/offline-manual-check"); return "UNEXPECTEDLY ALLOWED"; }
    catch (error) { return String(error); }
  }, manualWindowId);
  expect(blockedNetwork).toMatch(/ERR_BLOCKED_BY_CLIENT/);
  await app.evaluate(({ BrowserWindow }, id) => {
    globalThis.manualNavigationObserved = false;
    BrowserWindow.fromId(id).webContents.once("will-navigate", () => { globalThis.manualNavigationObserved = true; });
  }, manualWindowId);
  await manual.evaluate(() => { const link = document.createElement("a"); link.href = "https://example.invalid/"; document.body.append(link); link.click(); link.remove(); });
  await expect.poll(() => app.evaluate(() => globalThis.manualNavigationObserved)).toBe(true);
  // Electron cancels these navigations before commit. Chromium's CDP frame
  // bookkeeping can temporarily report an empty URL for a custom protocol;
  // verify the real WebContents and live document rather than that cached URL.
  const expectRetainedDocument = async () => {
    const windowUrl = await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).webContents.getURL(), manualWindowId);
    const documentState = await manual.evaluate(() => ({ url: location.href, heading: document.querySelector("article h1")?.textContent, ready: document.readyState }));
    console.log("Manual canceled-navigation state:", JSON.stringify({ windowUrl, document: documentState }));
    expect(windowUrl).toBe(manualHome);
    expect(documentState.url).toBe(manualHome);
    expect(documentState.heading).toBeTruthy();
    expect(documentState.ready).toBe("complete");
  };
  await expectRetainedDocument();
  expect(await app.evaluate(() => globalThis.manualExternalCalls)).toEqual([]);
  // A canceled custom-scheme navigation leaves Playwright's CDP navigation
  // bookkeeping pending even though the actual document is intact (above).
  const externalUrl = await manual.evaluate(() => {
    const link = [...document.querySelectorAll(".header-links a")].find((anchor) => anchor.textContent.trim().startsWith("GitHub"));
    if (!link) throw new Error("Manual GitHub link is missing");
    const url = link.href;
    link.click();
    return url;
  });
  await expect.poll(() => app.evaluate(() => globalThis.manualExternalCalls)).toEqual([externalUrl]);
  await expectRetainedDocument();

  expect(await request("status")).toEqual(originalState.status);
  expect(await request("location", { key: "alpha" })).toEqual(originalState.location);
  const manualClosed = manual.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).close(), manualWindowId);
  await manualClosed;
  expect(await countWindows()).toBe(1);
  expect(await request("status")).toEqual(originalState.status);
  expect(await request("location", { key: "alpha" })).toEqual(originalState.location);
  await expect(editor.getByLabel("Draft value")).toHaveValue("12345");

  const reopenedEvent = app.waitForEvent("window");
  await editor.evaluate(() => window.eu5.openLink("manual"));
  const reopened = await reopenedEvent;
  await expect(reopened).toHaveURL(manualHome);
  await expect(reopened.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(reopened.locator("html")).toHaveAttribute("data-preference", "dark");
  await expect(reopened.locator(".theme-toggle")).toHaveCount(0);
  expect(await countWindows()).toBe(2);
  expect(errors).toEqual([]);
  const closed = app.waitForEvent("close");
  const ownerManualClosed = reopened.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().startsWith("eu5-manual:")).close());
  await editor.getByRole("button", { name: "Discard and exit", exact: true }).click();
  await Promise.all([closed, ownerManualClosed]);
  console.log(`PASS: offline manual ${version}, one window for concurrent/repeated opens, 15 chapters, ${screenshotSources.size} screenshot assets, application Appearance initial/preview/cancel/save/System sync without independent override, theme-matched screenshots and preserved scroll, local search/full-size navigation, code copying with clipboard reads denied, isolated renderer and IPC sender, blocked networking, allowlisted external link, retained editor state, reopen and owner-close lifecycle.`);
} finally {
  try { await cleanup(); }
  finally { await rm(work, { recursive: true, force: true }); }
}
