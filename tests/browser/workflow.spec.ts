import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
// Renderer-only browser tests: the mock bridge is test-owned and never enters production.
// These do not claim that Rust IPC, Electron, or native export passed.
test.beforeEach(async ({ page }) => {
  await page.route("https://eu5-test.invalid/**", async (route) => {
    const relative =
      new URL(route.request().url()).pathname.slice(1) || "index.html";
    if (relative.includes("..")) return route.abort();
    const path = resolve("build/renderer", relative);
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
    };
    try {
      await route.fulfill({
        body: await readFile(path),
        contentType: types[extname(path)] || "application/octet-stream",
      });
    } catch {
      await route.abort();
    }
  });
  await page.addInitScript(() => {
    const original = {
      "peasants|amber|sun": {
        type: "peasants",
        culture: "amber",
        religion: "sun",
        size: "7.001",
      },
      "clergy|amber|sun": {
        type: "clergy",
        culture: "amber",
        religion: "sun",
        size: "0.999",
      },
      "peasants|blue|moon": {
        type: "peasants",
        culture: "blue",
        religion: "moon",
        size: "2",
      },
    };
    let working = structuredClone(original),
      draft: any = null,
      token = 0,
      modified = 0,
      saved: any = null;
    const status = () => ({
      fingerprint: "synthetic-bridge-fixture-not-real-eu5",
      compatible: true,
      dirty: modified > 0,
      modified,
      drafts: draft ? 1 : 0,
      undo: false,
      redo: false,
      countries: [{ tag: "ALP", name: "Alpine Assembly", count: 2 }],
      definitions: {
        culture: ["amber", "blue", "copper"],
        religion: ["sun", "moon"],
        type: ["peasants", "clergy"],
      },
      map_available: !!(window as any).__mapFixtureEnabled,
      map_indexed: !!(window as any).__mapFixtureEnabled,
      selected_country: "",
      selected_location: "",
    });
    const total = (rows: any) =>
      String(
        Object.values(rows).reduce(
          (sum: number, r: any) => sum + Math.round(Number(r.size) * 1000),
          0,
        ) / 1000,
      );
    const location = (key = "alpha") => ({
      key,
      name: key === "alpha" ? "Alpha City" : "Beta City",
      owners: ["ALP"],
      original,
      working,
      draft,
      original_total: "10",
      working_total: total(working),
      draft_total: draft ? total(draft) : null,
      draft_token: draft ? token : null,
      region: (window as any).__mapFixtureEnabled ? { min_x: 900, max_x: 999, min_y: 450, max_y: 499, area: 5000, sum_x: 0, sum_y: 0 } : null,
      map_dimensions: (window as any).__mapFixtureEnabled ? [2000, 1200] : null,
    });
    let settings = { theme: "dark", gameDir: "", gameVersion: "1.4.5", autoLoad: true, rememberWindow: true, rememberFolders: true, geometry: null };
    (window as any).eu5 = {
      settings: async (value?: any) => { if (value) settings = { ...settings, ...value }; return { ...settings }; },
      installationVersion: async () => ({ version: "1.4.5", source: "manual" }),
      browseGameDirectory: async () => "/games/Europa Universalis V",
      startup: async () => null,
      respondConfirmation: async (token: string, action: string) => {
        (window as any).__confirmationResponse = { token, action };
        (window as any).__eventListener({ event: "confirmation-closed", data: { token } });
      },
      openLink: async () => {},
      previewTheme: async () => {},
      preferences: async () => ({ theme: "dark" }),
      gameVersion: async (value?: string) => ({ version: value?.replace(/^v/i, "") || "1.4.5", source: "manual" }),
      onEvent: (listener: any) => { (window as any).__eventListener = listener; return () => {}; },
      restart: async () => true,
      request: async (method: string, params: any = {}) => {
        switch (method) {
          case "load_game":
          case "load_saved_game":
            settings.gameDir = "/games/Europa Universalis V";
            return status();
          case "status":
            return status();
          case "draft_activity":
            return true;
          case "select":
            ((window as any).__mapSelections ||= []).push(params.location);
            return true;
          case "map_tile":
            ((window as any).__mapTiles ||= []).push(params);
            return { image: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#456a87"/></svg>') };
          case "map_hit":
            return (window as any).__mapHit;
          case "validate":
            return { state: "Ready with warnings", issues: [] };
          case "locations":
            return {
              total: 2,
              items: [
                {
                  key: "alpha",
                  name: "Alpha City",
                  modified: !!modified,
                  draft: !!draft,
                },
                {
                  key: "beta",
                  name: "Beta City",
                  modified: false,
                  draft: false,
                },
              ],
            };
          case "location":
            return location(params.key);
          case "preview":
            draft = structuredClone(working);
            draft[params.operation.tuple].size = params.operation.value;
            token++;
            return location();
          case "discard":
            draft = null;
            return location();
          case "apply":
            if (params.token !== token) throw Error("Stale preview");
            working = draft;
            draft = null;
            modified = 1;
            return location();
          case "save":
            saved = structuredClone(working);
            (window as any).__saved = saved;
            return status();
          default:
            throw Error("Unexpected mock call: " + method);
        }
      },
    };
  });
  await page.goto("https://eu5-test.invalid/");
});
test("welcome and workspace render without horizontal overflow", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Shape a location. Keep its history." }),
  ).toBeVisible();
  await page.screenshot({ path: "build/browser-welcome.png", fullPage: true });
  await page.getByRole("button", { name: "Select EU5 game data" }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  await expect(
    page.getByRole("heading", { name: "Demographics", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "build/browser-workspace.png",
    fullPage: true,
  });
});
test("typing, review, save, discard and Apply remain distinct", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Select EU5 game data" }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  const row = page.locator("tbody tr").filter({ hasText: "7,001" }).first();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Draft value").fill("12345");
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as any).__saved["peasants|amber|sun"].size,
    ),
  ).toBe("7.001");
  await page.screenshot({ path: "build/browser-draft.png", fullPage: true });
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Draft edit" })).toHaveCount(
    0,
  );
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Draft value").fill("9000");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as any).__saved["peasants|amber|sun"].size,
    ),
  ).toBe("9");
  expect(
    await page.evaluate(() => (window as any).__saved["clergy|amber|sun"].size),
  ).toBe("0.999");
});
test("unreviewed typed Draft is retained across navigation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Select EU5 game data" }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "7,001" })
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Draft value").fill("42001");
  await page.getByRole("button", { name: /Beta City/ }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  await expect(page.getByLabel("Draft value")).toHaveValue("42001");
});


test("confirmations follow the active theme and Escape cancels without discarding", async ({ page }) => {
  const emit = (reason: "exit" | "replace", error = "") => page.evaluate(({ reason, error }) => {
    (window as any).__eventListener({ event: "confirmation", data: {
      token: "browser-confirmation", reason, hasDrafts: true, canSave: true, unavailable: false, error,
    } });
  }, { reason, error });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Dark theme", exact: true }).locator("..").click();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await emit("exit");
  let dialog = page.getByRole("dialog", { name: "Unsaved work — exit editor?" });
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  const dark = await dialog.evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__confirmationResponse)).toEqual({ token: "browser-confirmation", action: "cancel" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Light theme", exact: true }).locator("..").click();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await emit("replace", "Save was canceled. Your current work is still open.");
  dialog = page.getByRole("dialog", { name: "Replace current work?" });
  await expect(dialog.getByRole("alert")).toContainText("still open");
  const light = await dialog.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(light).not.toBe(dark);
  await dialog.getByRole("button", { name: "Discard and continue" }).click();
  expect(await page.evaluate(() => (window as any).__confirmationResponse)).toEqual({ token: "browser-confirmation", action: "discard" });
});


test("blocked map regions retain selection while panning and zooming still work", async ({ page }) => {
  // Exercise the map inside the scrollable workspace at a normal window size.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setHit = (locations: string[], labels: string[], selectable_locations: string[], kinds: string[]) => page.evaluate((hit) => {
    (window as any).__mapHit = hit;
  }, { locations, labels, selectable_locations, kinds });
  await page.evaluate(() => { (window as any).__mapFixtureEnabled = true; });
  await setHit(["south_sea"], ["South Sea"], [], ["sea"]);
  await page.getByRole("button", { name: "Select EU5 game data" }).click();
  await page.getByRole("button", { name: /Alpha City/ }).click();
  const map = page.getByRole("application", { name: /Location map/ });
  await expect(map).toBeVisible();
  await map.scrollIntoViewIfNeeded();
  const initialSelections = await page.evaluate(() => (window as any).__mapSelections.length);
  for (const [key, label, kind] of [["south_sea", "South Sea", "sea"], ["mountain_corridor", "Mountain Corridor", "impassable"]]) {
    await setHit([key], [label], [], [kind]);
    await map.click({ position: { x: 100, y: 100 } });
    await expect(map).toContainText(label);
    await expect(map).toContainText("Not selectable for population editing");
    await expect(page.getByRole("heading", { name: "Alpha City", exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => (window as any).__mapSelections.length)).toBe(initialSelections);

  const beforePan = await page.evaluate(() => (window as any).__mapTiles.at(-1));
  const box = await map.boundingBox();
  if (!box) throw new Error("Map viewport missing");
  await page.mouse.move(box.x + 160, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 140, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).__mapTiles.at(-1).x)).toBeLessThan(beforePan.x);
  const beforeZoom = await page.evaluate(() => (window as any).__mapTiles.at(-1));
  await map.hover({ position: { x: 100, y: 100 } });
  const scrollPositions = () => map.evaluate(node => {
    const positions = [[window.scrollX, window.scrollY]];
    for (let parent = node.parentElement; parent; parent = parent.parentElement)
      positions.push([parent.scrollLeft, parent.scrollTop]);
    return positions;
  });
  const beforeScroll = await scrollPositions();
  await page.mouse.wheel(0, -240);
  await expect.poll(() => page.evaluate(() => (window as any).__mapTiles.at(-1).width)).toBeLessThan(beforeZoom.width);
  expect(await scrollPositions()).toEqual(beforeScroll);
  const zoomedWidth = await page.evaluate(() => (window as any).__mapTiles.at(-1).width);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => (window as any).__mapTiles.at(-1).width)).toBeGreaterThan(zoomedWidth);
  expect(await scrollPositions()).toEqual(beforeScroll);
  expect(await page.evaluate(() => (window as any).__mapSelections.length)).toBe(initialSelections);

  await setHit(["beta", "sea_alias"], ["Beta City", "Shared Sea"], ["beta"], ["land", "sea"]);
  await map.click({ position: { x: 100, y: 100 } });
  await expect(map).toContainText("Ambiguous RGB");
  await expect(map).toContainText("sea_alias");
  expect(await page.evaluate(() => (window as any).__mapSelections.length)).toBe(initialSelections);

  await setHit(["beta"], ["Beta City"], ["beta"], ["land"]);
  await map.click({ position: { x: 100, y: 100 } });
  await expect(page.getByRole("heading", { name: "Beta City", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__mapSelections.at(-1))).toBe("beta");
});


test("welcome fits without scrolling at supported sizes and after saving an installation", async ({ page }) => {
  for (const configured of [false, true]) {
    if (configured) {
      await page.locator(".gear-button").click();
      await page.getByRole("tab", { name: "Game", exact: true }).click();
      await page.getByLabel("Installation directory").fill("/games/Europa Universalis V");
      await page.getByRole("button", { name: "Save settings", exact: true }).click();
      await expect(page.getByRole("button", { name: "Load saved game data" })).toBeVisible();
    }
    for (const [width, height] of [[960, 640], [960, 680], [1024, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(async () => page.locator(".welcome").evaluate(content => {
        const viewport = content.parentElement!;
        const inner = content.getBoundingClientRect(), outer = viewport.getBoundingClientRect();
        return inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 && inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
      })).toBe(true);
      expect(await page.locator(".welcome-viewport").evaluate(node => ["hidden", "clip"].includes(getComputedStyle(node).overflowY))).toBe(true);
      const before = await page.evaluate(() => [window.scrollX, window.scrollY]);
      await page.locator(".welcome").hover();
      await page.mouse.wheel(0, 800);
      expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      await expect(page.getByText("Your installation stays read-only.", { exact: false })).toBeVisible();
    }
  }
});

test("settings keyboard navigation, theme cancellation and persistent footer stay usable at minimum size", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.locator(".gear-button").click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await page.getByRole("radio", { name: "Light theme" }).locator("..").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const appearance = page.getByRole("tab", { name: "Appearance", exact: true });
  await appearance.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Game", exact: true })).toBeFocused();
  await expect(page.getByLabel("Installation directory")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Window", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".gear-button")).toBeFocused();
});
