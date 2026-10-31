// Real main/preload/renderer confirmation flow. Native file-picker answers only
// are automated; unsaved-work decisions use the actual themed app buttons.
import { _electron, expect } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { syntheticGame, population } from "../helpers/synthetic-game.mjs";
import { createDesktopCleanup } from "../helpers/desktop-cleanup.mjs";

await mkdir("build/desktop-tests", { recursive: true });
const work = await mkdtemp(resolve("build/desktop-tests/confirmations-"));
const game = await syntheticGame(join(work, "game"));
const project = join(work, "Saved Working.eu5popproj");
const executablePath = process.env.EU5_QA_EXECUTABLE;
const app = await _electron.launch({
  ...(executablePath ? { executablePath: resolve(executablePath) } : {}),
  args: [
    ...(process.env.EU5_QA_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
    "--disable-gpu", `--user-data-dir=${join(work, "profile")}`,
    ...(executablePath ? [] : [resolve(".")]),
  ],
  timeout: 30000,
});
const cleanup = createDesktopCleanup(app);
const page = await app.firstWindow();
const request = (method, params = {}) => page.evaluate(({ method, params }) => window.eu5.request(method, params), { method, params });
const picker = async (path, save = false, canceled = false) => app.evaluate(({ dialog }, { path, save, canceled }) => {
  dialog.showMessageBox = async () => { throw new Error("Native confirmation dialogs are forbidden"); };
  if (save) dialog.showSaveDialog = async () => ({ canceled, filePath: canceled ? undefined : path });
  else dialog.showOpenDialog = async () => ({ canceled, filePaths: canceled ? [] : [path] });
}, { path, save, canceled });
const closeWindow = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
const confirmation = () => page.getByRole("dialog").filter({ hasText: "Your current session contains unsaved work." });
const review = async (value, apply = false) => {
  await page.locator("tbody tr").filter({ hasText: "peasants" }).first().getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Draft value").fill(value);
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
  if (apply) await page.getByRole("button", { name: "Apply", exact: true }).click();
};
try {
  await picker(game);
  await page.getByRole("button", { name: "Select EU5 game data" }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  await review("9.001");
  await closeWindow();
  await expect(confirmation()).toBeVisible();
  await expect(confirmation().getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expect(confirmation()).toContainText("Pending Draft edits are not saved.");
  await expect(page.evaluate(() => window.eu5.respondConfirmation("unissued-token", "discard"))).rejects.toThrow();
  await confirmation().getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirmation()).toHaveCount(0);
  expect((await request("status")).drafts).toBe(1);

  await page.getByRole("button", { name: "New Project", exact: true }).click();
  await expect(confirmation()).toBeVisible();
  await confirmation().getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirmation()).toHaveCount(0);
  expect((await request("status")).drafts).toBe(1);

  await picker(project, true, true);
  await closeWindow();
  await confirmation().getByRole("button", { name: "Save Working and exit" }).click();
  await expect(confirmation().getByRole("alert")).toContainText("Save was canceled");
  expect((await request("status")).drafts).toBe(1);
  await picker(game, true);
  await confirmation().getByRole("button", { name: "Save Working and exit" }).click();
  await expect(confirmation().getByRole("alert")).toContainText("Could not save");
  await expect(confirmation()).toBeVisible();
  expect(await readFile(join(game, "main_menu/setup/start/06_pops.txt"), "utf8")).toBe(population);
  await confirmation().getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "New Project", exact: true }).click();
  await confirmation().getByRole("button", { name: "Discard and continue" }).click();
  await expect(confirmation()).toHaveCount(0);
  await expect.poll(async () => (await request("status")).drafts).toBe(0);
  await page.getByRole("button", { name: /Alpha City/ }).click();
  await review("9.001", true);
  await picker(project, true);
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  await confirmation().getByRole("button", { name: "Save Working and continue" }).click();
  await expect(confirmation()).toHaveCount(0);
  await expect.poll(async () => (await request("status")).modified).toBe(0);
  expect(JSON.parse(await readFile(project, "utf8")).project.changes.alpha.working.some((row) => row.size === "9.001")).toBe(true);

  await picker(project);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  await review("10.001", true);
  await closeWindow();
  await expect(confirmation()).toBeVisible();
  const closed = app.waitForEvent("close");
  await confirmation().getByRole("button", { name: "Save Working and exit" }).click();
  await closed;
  expect(JSON.parse(await readFile(project, "utf8")).project.changes.alpha.working.some((row) => row.size === "10.001")).toBe(true);
  console.log("PASS: themed Cancel/Discard/Save confirmations, Draft warning, file-picker cancellation, failed-save retention, request token validation, replacement and saved exit.");
} finally {
  try {
    await cleanup();
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
