// Real Electron + real Rust sidecar. Only native dialog answers are automated.
import { _electron, expect } from "@playwright/test";
import { mkdtemp, readFile, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { syntheticGame, population } from "../helpers/synthetic-game.mjs";
import { createDesktopCleanup } from "../helpers/desktop-cleanup.mjs";
const root = resolve(".");
await mkdir("build/desktop-tests", { recursive: true });
const work = await mkdtemp(
  resolve("build/desktop-tests/Non-default Steam Library Ω "),
);
const game = await syntheticGame(
  join(work, "steamapps/common/Europa Universalis V/game"),
);
const saved = join(work, "Population Ω.eu5popproj");
const output = join(work, "export");
await mkdir(output);
const args = [
  ...(process.env.EU5_QA_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
  "--disable-gpu",
  `--user-data-dir=${join(work, "profile")}`,
];
const app = await _electron.launch({
  ...(process.env.EU5_QA_EXECUTABLE
    ? { executablePath: resolve(process.env.EU5_QA_EXECUTABLE) }
    : {}),
  args: [...args, ...(process.env.EU5_QA_EXECUTABLE ? [] : [root])],
  timeout: 30000,
});
const cleanup = createDesktopCleanup(app);
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const dialog = async (path, save = false) =>
  app.evaluate(
    ({ dialog }, { path, save }) => {
      if (save)
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: path,
        });
      else
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [path],
        });

    },
    { path, save },
  );
const request = (method, params = {}) =>
  page.evaluate(({ method, params }) => window.eu5.request(method, params), {
    method,
    params,
  });
try {
  await expect(
    page.getByRole("heading", { name: "Shape a location. Keep its history." }),
  ).toBeVisible();
  await dialog(game);
  await page.getByRole("button", { name: "Select EU5 game data" }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  await expect(
    page.getByRole("heading", { name: "Demographics", exact: true }),
  ).toBeVisible();
  expect((await request("validate")).state).not.toBe("Action required");
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  expect(prefs.contextIsolation).toBe(true);
  expect(prefs.nodeIntegration).toBe(false);
  expect(prefs.sandbox).toBe(true);
  expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
  expect(await page.evaluate(() => Object.keys(window.eu5).sort())).toEqual([
    "gameVersion",
    "onEvent",
    "openLink",
    "preferences",
    "request",
    "respondConfirmation",
    "restart",
  ]);
  const edit = async (value) => {
    await page
      .locator("tbody tr")
      .filter({ hasText: "7.001" })
      .first()
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await page.getByLabel("Draft value").fill(value);
  };
  await edit("999");
  expect((await request("location", { key: "alpha" })).working_total).toBe(
    "10",
  );
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeEnabled();
  await dialog(saved, true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  expect(
    Object.keys(JSON.parse(await readFile(saved, "utf8")).project.changes),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  expect((await request("location", { key: "alpha" })).working_total).toBe(
    "10",
  );
  await edit("8.001");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page.screenshot({ path: "build/desktop-draft.png" });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  let loc = await request("location", { key: "alpha" });
  expect(loc.working_total).toBe("11");
  expect(loc.working["clergy|amber|sun"].size).toBe("0.999");
  await page
    .getByRole("button", { name: "Rebalance ratios", exact: true })
    .click();
  await page.getByLabel("Weights or percentages").fill("amber = 7\nblue = 3");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeEnabled();
  expect((await request("location", { key: "alpha" })).draft_total).toBe("11");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Population Group", exact: true })
    .click();
  await page.getByLabel("New type").fill("clergy");
  await page.getByLabel("New culture").fill("copper");
  await page.getByLabel("New religion").fill("moon");
  await page.getByLabel("Size", { exact: true }).fill("1.25");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  expect((await request("location", { key: "alpha" })).working_total).toBe(
    "12.25",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  await dialog(saved);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  expect((await request("location", { key: "alpha" })).working_total).toBe(
    "12.25",
  );
  await request("map_index");
  expect((await request("map_hit", { x: 0, y: 0 })).locations[0]).toBe("alpha");
  await page
    .locator("tbody tr")
    .filter({ hasText: "copper" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Draft value").fill("999");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page.getByRole("button", { name: "Export Mod", exact: true }).click();
  await page.getByLabel("Mod name", { exact: true }).fill("Desktop Test");
  await page.getByLabel("Stable folder-safe ID").fill("desktop-test");
  await expect(page.getByLabel("Supported EU5 version")).toHaveValue("1.4.5");
  const ack = page.getByRole("checkbox", { name: /this game version has not been verified/ });
  await expect(ack).toHaveCount(0);
  await page.getByLabel("Supported EU5 version").fill("1.4.6");
  await expect(ack).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose output and export" })).toBeDisabled();
  await page.getByLabel("Supported EU5 version").fill("v1.4.5");
  await expect(ack).toHaveCount(0);
  await dialog(output);
  await page.getByRole("button", { name: "Choose output and export" }).click();
  await expect(page.getByText(/Verified export written/)).toBeVisible();
  expect(
    await readFile(join(game, "main_menu/setup/start/06_pops.txt"), "utf8"),
  ).toBe(population);
  expect(
    await readFile(
      join(output, "desktop-test-export/desktop-test/.metadata/metadata.json"),
      "utf8",
    ),
  ).toContain("Desktop Test");
  expect(
    await readFile(
      join(
        output,
        "desktop-test-export/desktop-test/main_menu/setup/start/06_pops.txt",
      ),
      "utf8",
    ),
  ).not.toContain("size=999");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.screenshot({ path: "build/desktop-workspace.png" });
  await dialog(game);
  let plan = await request("upgrade_plan");
  expect(plan.items[0].classification).toBe("Safe — unchanged vanilla");
  const next = await syntheticGame(
    join(work, "New Vanilla Ω/game"),
    population
      .replace("size=7.001", "size=14.002")
      .replace("size=0.999", "size=1.998")
      .replace("size=2}", "size=4}"),
  );
  await dialog(next);
  plan = await request("upgrade_plan");
  expect(plan.items[0].classification).toBe("Safe — scaled to new vanilla");
  expect((await request("location", { key: "alpha" })).working_total).toBe(
    "12.25",
  );
  await request("upgrade_commit");
  expect((await request("location", { key: "alpha" })).working_total).toBe(
    "24.5",
  );
  const conflict = await syntheticGame(
    join(work, "Structural Vanilla/game"),
    population.replace("culture=amber", "culture=copper"),
  );
  await dialog(conflict);
  plan = await request("upgrade_plan");
  expect(plan.items[0].proposal).toBe(null);
  await expect(request("upgrade_commit")).rejects.toThrow();
  await request("upgrade_resolve", { key: "alpha", choice: "keep_new" });
  await request("upgrade_commit");
  expect((await request("status")).modified).toBe(0);

  const restricted = await syntheticGame(join(work, "Restricted map/game"), population, { restrictedMap: true });
  await dialog(restricted);
  await page.getByRole("button", { name: "Game Data", exact: true }).click();
  const replaceConfirmation = page.getByRole("dialog").filter({ hasText: "Your current session contains unsaved work." });
  await expect(replaceConfirmation).toBeVisible();
  await replaceConfirmation.getByRole("button", { name: "Discard and continue", exact: true }).click();
  await expect(replaceConfirmation).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Game Data", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  await page.getByRole("button", { name: "Index map", exact: true }).click();
  const map = page.getByRole("application", { name: /Location map/ });
  await expect(map).toBeVisible();
  await map.scrollIntoViewIfNeeded();
  for (const [x, key, kind] of [[2, "south_sea", "sea"], [3, "blue_lake", "lake"], [4, "mountain_corridor", "impassable"], [5, "wasteland_corridor", "non_ownable"]]) {
    const hit = await request("map_hit", { x, y: 0 });
    expect(hit.locations).toEqual([key]);
    expect(hit.kinds).toEqual([kind]);
    expect(hit.selectable_locations).toEqual([]);
    const bounds = await map.boundingBox();
    if (!bounds) throw new Error("Indexed map viewport missing");
    await map.click({ position: { x: bounds.width * (x + 0.5) / 8, y: bounds.height / 2 } });
    await expect(map).toContainText(key);
    await expect(map).toContainText("Not selectable for population editing");
    expect((await request("status")).selected_location).toBe("alpha");
  }
  const shared = await request("map_hit", { x: 6, y: 0 });
  expect([...shared.locations].sort()).toEqual(["sea_alias", "shared_land"]);
  expect(shared.selectable_locations).toEqual([]);
  const mapBounds = await map.boundingBox();
  if (!mapBounds) throw new Error("Indexed map viewport missing");
  await map.click({ position: { x: mapBounds.width * 6.5 / 8, y: mapBounds.height / 2 } });
  await expect(map).toContainText("Ambiguous RGB");
  await expect(map).toContainText("sea_alias");
  await expect(map).toContainText("shared_land");
  expect((await request("status")).selected_location).toBe("alpha");
  expect((await request("map_hit", { x: 1, y: 0 })).selectable_locations).toEqual(["beta"]);
  await map.click({ position: { x: mapBounds.width * 1.5 / 8, y: mapBounds.height / 2 } });
  await expect(page.getByRole("heading", { name: "Beta City", exact: true })).toBeVisible();
  expect((await request("status")).selected_location).toBe("beta");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS: native desktop load, security settings, exact Draft/Discard/Apply, Working-only save, exact ratios, add, reload, map, Working-only export, scaled/structural migration, read-only sources, nonselectable terrain, ambiguous RGB protection and layout.",
  );
} finally {
  try {
    await cleanup();
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
