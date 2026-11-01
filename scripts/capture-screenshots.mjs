// Capture the real built Electron application and Rust core with fictional data.
// Build first, then run from the repository root, for example:
// DISPLAY=:93 EU5_QA_NO_SANDBOX=1 node scripts/capture-screenshots.mjs
// EU5_QA_EXECUTABLE optionally selects a packaged application. Screenshots go to
// build/screenshots (or EU5_SCREENSHOT_DIR); generated game/profile data is removed.
// Only native file-dialog answers are automated; product UI/IPC are not mocked.
import { _electron, expect } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { demoGame } from "../tests/helpers/demo-game.mjs";
import { createDesktopCleanup } from "../tests/helpers/desktop-cleanup.mjs";

const repository = resolve(".");
const output = resolve(process.env.EU5_SCREENSHOT_DIR || "build/screenshots");
await mkdir(output, { recursive: true });
await mkdir("build/screenshot-fixtures", { recursive: true });
const work = await mkdtemp(resolve("build/screenshot-fixtures/demo-"));
const game = await demoGame(join(work, "Fictional demonstration", "game"));
const generated = [];

try {
  for (const theme of ["light", "dark"]) {
    const executablePath = process.env.EU5_QA_EXECUTABLE;
    const app = await _electron.launch({
      ...(executablePath ? { executablePath: resolve(executablePath) } : {}),
      args: [
        ...(process.env.EU5_QA_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
        "--disable-gpu", `--user-data-dir=${join(work, `profile-${theme}`)}`,
        ...(executablePath ? [] : [repository]),
      ],
      timeout: 30000,
    });
    const cleanup = createDesktopCleanup(app);
    try {
      const page = await app.firstWindow();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.unmaximize();
        window.setSize(1600, 1000);
        window.setPosition(0, 0);
      });
      await expect(page.getByRole("heading", { name: "Shape a location. Keep its history." })).toBeVisible();
      const settings = () => page.getByRole("dialog", { name: "Settings", exact: true });
      const ready = async (allowPendingConfirmation = false) => {
        if (!allowPendingConfirmation) await expect(page.locator(".busy.banner")).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(page.locator(".error.banner")).toHaveCount(0);
      };
      const capture = async (name, allowPendingConfirmation = false) => {
        await ready(allowPendingConfirmation);
        await page.mouse.move(1590, 985);
        await page.screenshot({ path: join(output, name), animations: "disabled" });
        generated.push(name);
        console.log(`Captured ${name}`);
      };
      const top = () => page.locator(".location-workspace").evaluate((element) => { element.scrollTop = 0; });
      const mapReady = async (name, previousImage = null) => {
        const map = page.getByAltText(`Indexed location map around ${name}`);
        await expect(map).toBeVisible();
        if (previousImage) await expect.poll(() => map.getAttribute("src")).not.toBe(previousImage);
        await expect.poll(() => map.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
        await ready();
      };

      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await settings().getByRole("radio", { name: `${theme === "light" ? "Light" : "Dark"} theme`, exact: true }).locator("..").click();
      await settings().getByRole("button", { name: "Save settings", exact: true }).click();
      await expect(settings()).toHaveCount(0);
      await capture(`welcome-${theme}.png`);

      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await capture(`settings-appearance-${theme}.png`);
      await settings().getByRole("radio", { name: "System theme", exact: true }).locator("..").click();
      await expect(settings().getByRole("radio", { name: "System theme", exact: true })).toBeChecked();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "auto");
      await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe("system");
      // Exercise both operating-system appearances while the UI and native
      // preference remain System. Media emulation only affects this test page.
      await page.emulateMedia({ colorScheme: theme });
      await expect.poll(() => page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(theme === "dark");
      await capture(`settings-appearance-system-${theme}.png`);
      await settings().getByRole("radio", { name: `${theme === "light" ? "Light" : "Dark"} theme`, exact: true }).locator("..").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.emulateMedia({ colorScheme: null });
      await settings().getByRole("tab", { name: "Game", exact: true }).click();
      // A clearly illustrative, unsaved directory avoids publishing local paths.
      await settings().getByLabel("Installation directory", { exact: true }).fill("D:\\Games\\Europa Universalis V");
      await settings().getByLabel("Manual EU5 version", { exact: true }).fill("1.4.5");
      await expect(settings().getByText("Checking the installation’s saved version…", { exact: true })).toHaveCount(0);
      await capture(`settings-game-${theme}.png`);
      await settings().getByRole("tab", { name: "Window", exact: true }).click();
      await capture(`settings-window-${theme}.png`);
      await settings().getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(settings()).toHaveCount(0);

      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, game);
      await page.getByRole("button", { name: "Select EU5 game data", exact: true }).click();
      await page.getByRole("button", { name: /Alpha City/ }).click();
      await expect(page.getByRole("heading", { name: "Alpha City", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Index map", exact: true }).click();
      await mapReady("Alpha City");
      await top();
      await capture(`workspace-${theme}.png`);

      await page.locator(".map-panel").scrollIntoViewIfNeeded();
      await capture(`map-${theme}.png`);
      const alphaImage = await page.getByAltText("Indexed location map around Alpha City").getAttribute("src");
      await page.getByRole("button", { name: /Beta City/ }).click();
      await mapReady("Beta City", alphaImage);
      await page.locator(".map-panel").scrollIntoViewIfNeeded();
      await capture(`map-secondary-${theme}.png`);
      const betaImage = await page.getByAltText("Indexed location map around Beta City").getAttribute("src");
      await page.getByRole("button", { name: /Alpha City/ }).click();
      await mapReady("Alpha City", betaImage);
      await top();

      await page.locator(".demographics-card tbody tr")
        .filter({ hasText: "peasants" }).filter({ hasText: "amber" }).first()
        .getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByLabel("Draft value", { exact: true }).fill("75000");
      await page.getByRole("button", { name: "Review draft", exact: true }).click();
      await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
      await top();
      if (theme === "light") await capture("edit-review.png");
      await page.getByRole("button", { name: "New Project", exact: true }).click();
      const confirmation = page.getByRole("dialog").filter({ hasText: "Your current session contains unsaved work." });
      await expect(confirmation).toBeVisible();
      await capture(`confirmation-${theme}.png`, true);
      await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(errors).toEqual([]);
    } finally {
      await cleanup();
    }
  }
  console.log(`Captured ${generated.length} production UI screenshots with fictional data at ${output}.`);
} finally {
  await rm(work, { recursive: true, force: true });
}
