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
  countries = [{ tag: "ALP", name: "Alpine Assembly", count: 2 }];
  window.eu5 = {
    openLink: vi.fn(async () => {}),
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
  fireEvent.click(screen.getByText("Select EU5 game data"));
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
it("fills the existing export version field and saves a manual edit independently of project changes", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Export Mod" }));
  expect((screen.getByLabelText("Supported EU5 version") as HTMLInputElement).value).toBe("1.4.5");
  fireEvent.change(screen.getByLabelText("Supported EU5 version"), { target: { value: "v1.4.6" } });
  fireEvent.click(screen.getByRole("button", { name: "Save game version" }));
  await waitFor(() => expect((screen.getByLabelText("Supported EU5 version") as HTMLInputElement).value).toBe("1.4.6"));
  expect(window.eu5.gameVersion).toHaveBeenCalledWith("v1.4.6");
  expect(working).toEqual(original);
  expect(modified).toBe(0);
  cleanup();
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Export Mod" }));
  expect((screen.getByLabelText("Supported EU5 version") as HTMLInputElement).value).toBe("1.4.6");
});
it("exports the saved normalized manual version while keeping validation independent", async () => {
  modified = 1;
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Export Mod" }));
  fireEvent.change(screen.getByLabelText("Supported EU5 version"), { target: { value: "v1.4.7" } });
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
  expect(screen.getByText(/Version 1.0.0/)).toBeTruthy();
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
  const version = screen.getByLabelText("Supported EU5 version");
  fireEvent.change(version, { target: { value: "v1.4.6" } });
  expect((output as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /I understand/ }));
  expect((output as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(version, { target: { value: "v1.4.7" } });
  expect((output as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("checkbox", { name: /I understand/ }) as HTMLInputElement).checked).toBe(false);
  fireEvent.change(version, { target: { value: "v1.4.5" } });
  expect(screen.queryByRole("checkbox", { name: /I understand/ })).toBeNull();
  fireEvent.click(output);
  await waitFor(() => expect(window.eu5.request).toHaveBeenCalledWith("export", {
    options: expect.objectContaining({ supported_game_version: "1.4.5", acknowledge_unverified_version: false }),
  }));
});
