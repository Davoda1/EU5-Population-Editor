import { it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { App } from "../src/renderer/App";
import type { AppSettings } from "../src/types/api";
import { version } from "../package.json";
let settings: AppSettings;
afterEach(cleanup);
let working: Record<string, any>,
  draft: Record<string, any> | null,
  saved: Record<string, any> | null,
  token: number,
  modified: number,
  gameVersion: string,
  countries: { tag: string; name: string; count: number }[],
  eventListener: (event: { event: string; data: Record<string, unknown> }) => void;
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
};
const status = () => ({
  fingerprint: "synthetic-fixture-only",
  compatible: true,
  dirty: modified > 0,
  modified,
  drafts: draft ? 1 : 0,
  undo: false,
  redo: false,
  countries,
  definitions: {
    culture: ["amber", "blue"],
    religion: ["sun"],
    type: ["peasants", "clergy"],
  },
  map_available: false,
  map_indexed: false,
  selected_country: "",
  selected_location: "",
});
const location = (key: string) => ({
  key,
  name: key === "alpha" ? "Alpha City" : "Beta City",
  owners: ["ALP"],
  original,
  working,
  draft,
  original_total: "8",
  working_total: "8",
  draft_total: draft ? "9" : null,
  draft_token: draft ? token : null,
  region: null,
  map_dimensions: null,
});
beforeEach(() => {
  // jsdom has no native dialog implementation; browser/desktop tests cover it.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  working = structuredClone(original);
  draft = null;
  saved = null;
  token = 0;
  modified = 0;
  gameVersion = "1.4.5";
  settings = { theme: "dark", gameDir: "", gameVersion: "1.4.5", autoLoad: true, rememberFolders: true, rememberWindow: true, geometry: null };
  countries = [{ tag: "ALP", name: "Alpine Assembly", count: 2 }];
  window.eu5 = {
    openLink: vi.fn(async () => {}),
    previewTheme: vi.fn(async () => {}),
    settings: vi.fn(async (value) => {
      if (value) {
        settings = { ...settings, ...value, gameVersion: value.gameVersion.trim().replace(/^v/i, "") };
        gameVersion = settings.gameVersion;
      }
      return { ...settings };
    }),
    browseGameDirectory: vi.fn(async () => "/games/Europa Universalis V"),
    installationVersion: vi.fn(async () => ({ version: "1.4.5", source: "manual" })),
    startup: vi.fn(async () => null),
    preferences: vi.fn(async () => ({ theme: "dark" })),
    gameVersion: vi.fn(async (value?: string) => {
      if (value !== undefined) gameVersion = value.trim().replace(/^v/i, "");
      return { version: gameVersion, source: "manual" };
    }),
    respondConfirmation: vi.fn(async () => {}),
    onEvent: (listener) => { eventListener = listener; return () => {}; },
    restart: vi.fn(),
    request: vi.fn(async (method, params: any = {}) => {
      switch (method) {
        case "load_game":
        case "load_saved_game":
          settings.gameDir = "/games/Europa Universalis V";
          return status();
        case "status":
          return status();
        case "draft_activity":
        case "select":
          return true;
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
              { key: "beta", name: "Beta City", modified: false, draft: false },
            ],
          };
        case "location":
          return location(params.key);
        case "preview":
          draft = structuredClone(working);
          draft[params.operation.tuple].size = params.operation.value;
          token++;
          return location(params.key);
        case "discard":
          draft = null;
          return location(params.key);
        case "apply":
          if (params.token !== token) throw Error("Stale token");
          working = draft!;
          draft = null;
          modified = 1;
          return location(params.key);
        case "save":
          saved = structuredClone(working);
          return status();
        case "export":
          return { path: "test-output" };
        default:
          throw Error(`Unexpected test bridge method ${method}`);
      }
    }) as any,
  };
});
async function start() {
  render(<App />);
  const load = screen.getByRole("button", { name: /Select EU5 game data|Load saved game data/ });
  await waitFor(() => expect((load as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(load);
  fireEvent.click(await screen.findByRole("button", { name: /Alpha City/ }));
  await screen.findByRole("heading", { name: "Demographics", exact: true });
}
async function edit() {
  const row = screen
    .getAllByRole("row")
    .find((r) => r.textContent?.includes("peasants"))!;
  fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
  await screen.findByLabelText("Draft value");
}
it("saves Working while a reviewed Draft stays pending", async () => {
  await start();
  await edit();
  fireEvent.change(screen.getByLabelText("Draft value"), {
    target: { value: "99" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Review draft", exact: true }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Apply",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(saved?.["peasants|amber|sun"].size).toBe("7.001"));
  expect(draft?.["peasants|amber|sun"].size).toBe("99");
});
it("preserves an unreviewed typed form across location navigation", async () => {
  await start();
  await edit();
  fireEvent.change(screen.getByLabelText("Draft value"), {
    target: { value: "42.001" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Beta City/ }));
  await screen.findByRole("heading", { name: "Beta City" });
  fireEvent.click(screen.getByRole("button", { name: /Alpha City/ }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Draft value") as HTMLInputElement).value,
    ).toBe("42.001"),
  );
  expect(working).toEqual(original);
});
it("Apply changes only the reviewed tuple and Discard never changes Working", async () => {
  await start();
  await edit();
  fireEvent.change(screen.getByLabelText("Draft value"), {
    target: { value: "9" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Review draft", exact: true }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Apply",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Discard", exact: true }));
  await waitFor(() =>
    expect(screen.queryByLabelText("Draft value")).toBeNull(),
  );
  expect(working).toEqual(original);
  await edit();
  fireEvent.change(screen.getByLabelText("Draft value"), {
    target: { value: "9" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Review draft", exact: true }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Apply",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
  await waitFor(() => expect(working["peasants|amber|sun"].size).toBe("9"));
  expect(working["clergy|amber|sun"].size).toBe("0.999");
});
async function changeGameVersion(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "Game settings", exact: true }));
  fireEvent.change(screen.getByLabelText("Manual EU5 version"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings", exact: true }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Export Mod" }));
}
it("uses Settings as the single place to edit the saved export game version", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Export Mod" }));
  expect((screen.getByLabelText("Supported EU5 version") as HTMLInputElement).readOnly).toBe(true);
  expect((screen.getByLabelText("Supported EU5 version") as HTMLInputElement).value).toBe("1.4.5");
  await changeGameVersion("v1.4.6");
  expect((screen.getByLabelText("Supported EU5 version") as HTMLInputElement).value).toBe("1.4.6");
  expect(window.eu5.settings).toHaveBeenCalledWith(expect.objectContaining({ gameVersion: "v1.4.6" }));
  expect(working).toEqual(original);
  expect(modified).toBe(0);
});
it("exports the saved normalized manual version while keeping validation independent", async () => {
  modified = 1;
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Export Mod" }));
  await changeGameVersion("v1.4.7");
  fireEvent.click(screen.getByLabelText(/I understand that this game version/));
  fireEvent.click(screen.getByRole("button", { name: "Choose output and export" }));
  await waitFor(() => expect(window.eu5.request).toHaveBeenCalledWith("export", {
    options: expect.objectContaining({ supported_game_version: "1.4.7" }),
  }));
  expect(window.eu5.request).toHaveBeenCalledWith("validate", {});
  expect(working).toEqual(original);
});

it("sorts countries by display name, resolves equal names by tag, and searches either", async () => {
  countries = [
    { tag: "AAA", name: "Zebra Republic", count: 1 },
    { tag: "ZZZ", name: "amber Union", count: 1 },
    { tag: "BBB", name: "Amber Union", count: 1 },
    { tag: "CCC", name: "Émeraude", count: 1 },
  ];
  await start();
  const country = screen.getByRole("combobox", { name: "Country" });
  const labels = () => within(country).getAllByRole("option").map((option) => option.textContent);
  expect(labels()).toEqual([
    "All countries / unowned", "Amber Union (BBB)", "amber Union (ZZZ)",
    "Émeraude (CCC)", "Zebra Republic (AAA)",
  ]);
  fireEvent.change(screen.getByLabelText("Country search"), { target: { value: "zebRA" } });
  expect(labels()).toEqual(["All countries / unowned", "Zebra Republic (AAA)"]);
  fireEvent.change(screen.getByLabelText("Country search"), { target: { value: "zzz" } });
  expect(labels()).toEqual(["All countries / unowned", "amber Union (ZZZ)"]);
});

it("offers public manual, source and issue links from About", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /About/ }));
  expect(screen.getByText(new RegExp(`Version ${version.replace(/\./g, "\\.")}`))).toBeTruthy();
  expect(screen.getByText(/GNU Affero General Public License/)).toBeTruthy();
  for (const [label, destination] of [["Manual", "manual"], ["Source code", "repository"], ["Report an issue", "issues"]]) {
    fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
    expect(window.eu5.openLink).toHaveBeenCalledWith(destination);
  }
});

it("shows a themed confirmation with Cancel focused and explicit Draft save semantics", async () => {
  render(<App />);
  act(() => eventListener({ event: "confirmation", data: { token: "issued-token", reason: "exit", hasDrafts: true, canSave: true, unavailable: false, error: "" } }));
  expect(screen.getByText("Pending Draft edits are not saved.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancel", exact: true })).toBe(document.activeElement);
  fireEvent.click(screen.getByRole("button", { name: "Save Working and exit" }));
  await waitFor(() => expect(window.eu5.respondConfirmation).toHaveBeenCalledWith("issued-token", "save"));
  act(() => eventListener({ event: "confirmation", data: { token: "issued-token", reason: "exit", hasDrafts: true, canSave: true, unavailable: false, error: "Save was canceled. Your current work is still open." } }));
  expect(screen.getByRole("alert").textContent).toContain("still open");
  act(() => eventListener({ event: "confirmation-closed", data: { token: "unrelated" } }));
  expect(screen.getByRole("button", { name: "Cancel", exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  await waitFor(() => expect(window.eu5.respondConfirmation).toHaveBeenCalledWith("issued-token", "cancel"));
  act(() => eventListener({ event: "confirmation-closed", data: { token: "issued-token" } }));
  expect(screen.queryByText("Unsaved work — exit editor?")).toBeNull();
});


it("exports the verified game version without an acknowledgment and resets consent for other versions", async () => {
  modified = 1;
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Export Mod" }));
  expect(screen.getByText("Compatibility verified with EU5 v1.4.5.")).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: /I understand/ })).toBeNull();
  const output = screen.getByRole("button", { name: "Choose output and export" });
  expect((output as HTMLButtonElement).disabled).toBe(false);
  await changeGameVersion("v1.4.6");
  expect((screen.getByRole("button", { name: "Choose output and export" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /I understand/ }));
  expect((screen.getByRole("button", { name: "Choose output and export" }) as HTMLButtonElement).disabled).toBe(false);
  await changeGameVersion("v1.4.7");
  expect((screen.getByRole("button", { name: "Choose output and export" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("checkbox", { name: /I understand/ }) as HTMLInputElement).checked).toBe(false);
  await changeGameVersion("v1.4.5");
  expect(screen.queryByRole("checkbox", { name: /I understand/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose output and export" }));
  await waitFor(() => expect(window.eu5.request).toHaveBeenCalledWith("export", {
    options: expect.objectContaining({ supported_game_version: "1.4.5", acknowledge_unverified_version: false }),
  }));
});


it("previews a theme and restores it on Cancel without saving preference changes", async () => {
  render(<App />);
  const gear = screen.getByRole("button", { name: "Settings", exact: true });
  await waitFor(() => expect((gear as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(gear);
  fireEvent.click(screen.getByRole("radio", { name: "Light theme" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  fireEvent.click(screen.getByRole("tab", { name: "Game", exact: true }));
  fireEvent.change(screen.getByLabelText("Installation directory"), { target: { value: "/games/Other installation" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(settings.gameDir).toBe("");
  expect(vi.mocked(window.eu5.settings).mock.calls.every(args => args.length === 0)).toBe(true);
});

it("saves browsed installation settings and the window reset as one explicit operation", async () => {
  render(<App />);
  const gear = screen.getByRole("button", { name: "Settings", exact: true });
  await waitFor(() => expect((gear as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(gear);
  fireEvent.click(screen.getByRole("tab", { name: "Game", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Browse…" }));
  await waitFor(() => expect((screen.getByLabelText("Installation directory") as HTMLInputElement).value).toBe("/games/Europa Universalis V"));
  fireEvent.change(screen.getByLabelText("Manual EU5 version"), { target: { value: "1.4.6" } });
  fireEvent.click(screen.getByRole("switch", { name: /Load saved game data on startup/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Remember project and export folders/ }));
  fireEvent.click(screen.getByRole("tab", { name: "Window", exact: true }));
  fireEvent.click(screen.getByRole("switch", { name: /Remember window size and position/ }));
  fireEvent.click(screen.getByRole("button", { name: "Reset window layout" }));
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(window.eu5.settings).toHaveBeenCalledWith({ theme: "dark", gameDir: "/games/Europa Universalis V", gameVersion: "1.4.6", autoLoad: false, rememberFolders: false, rememberWindow: false, resetWindow: true }));
  await screen.findByRole("button", { name: "Load saved game data" });
  expect(window.eu5.request).not.toHaveBeenCalledWith("load_game", expect.anything());
});

it("keeps settings open with an actionable validation error and retains the current project", async () => {
  await start();
  vi.mocked(window.eu5.settings).mockImplementation(async value => { if (value) throw Error("The directory does not contain EU5 game data."); return settings; });
  fireEvent.click(screen.getByRole("button", { name: "Settings", exact: true }));
  fireEvent.click(screen.getByRole("tab", { name: "Game", exact: true }));
  fireEvent.change(screen.getByLabelText("Installation directory"), { target: { value: "/missing" } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await screen.findByText("The directory does not contain EU5 game data.");
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByRole("heading", { name: "Alpha City", exact: true })).toBeTruthy();
  expect(working).toEqual(original);
});


it("waits for a stored installation version and ignores a stale lookup after a manual edit", async () => {
  render(<App />);
  const gear = screen.getByRole("button", { name: "Settings", exact: true });
  await waitFor(() => expect((gear as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(gear);
  fireEvent.click(screen.getByRole("tab", { name: "Game", exact: true }));
  let resolveVersion: (preference: { version: string; source: "manual" }) => void;
  vi.mocked(window.eu5.installationVersion).mockImplementation(() => new Promise(resolve => { resolveVersion = resolve; }));
  fireEvent.change(screen.getByLabelText("Installation directory"), { target: { value: "/games/Existing" } });
  expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => resolveVersion!({ version: "1.4.8", source: "manual" }));
  expect((screen.getByLabelText("Manual EU5 version") as HTMLInputElement).value).toBe("1.4.8");
  fireEvent.change(screen.getByLabelText("Installation directory"), { target: { value: "/games/Other" } });
  fireEvent.change(screen.getByLabelText("Manual EU5 version"), { target: { value: "1.4.9" } });
  await act(async () => resolveVersion!({ version: "1.4.6", source: "manual" }));
  expect((screen.getByLabelText("Manual EU5 version") as HTMLInputElement).value).toBe("1.4.9");
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
});
