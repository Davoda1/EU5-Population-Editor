import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MigrationDialog } from "../src/features/MigrationDialog";
import type { MigrationItem, MigrationPlan } from "../src/types/api";

beforeEach(() => {
  // Native modal behavior is covered by browser and desktop workflows.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(cleanup);
const item = (location: string, classification: string): MigrationItem => ({
  location, classification, old_vanilla: [], old_modified: [], new_vanilla: [],
  proposal: null, old_total: "10", new_total: "10", ratio: "1", resolution: null,
});

it("offers only keep-new for restricted locations while retaining normal conflict choices", async () => {
  const plan: MigrationPlan = {
    items: [item("mountain_corridor", "Conflict — restricted location"), item("alpha", "Conflict — structural change")],
    new_locations: [], removed_locations: [], ownership_changes: {}, tag_candidates: [],
    confirmed_tag_mappings: {}, acknowledged_topology: false,
  };
  const onPlan = vi.fn();
  const call = vi.fn(async () => plan);
  render(<MigrationDialog plan={plan} onPlan={onPlan} onCommit={vi.fn()} onClose={vi.fn()} call={call as any} />);
  const [restricted, ordinary] = screen.getAllByLabelText("Explicit resolution") as HTMLSelectElement[];
  expect(Array.from(restricted.options, option => option.value)).toEqual(["", "keep_new"]);
  expect(Array.from(ordinary.options, option => option.value)).toEqual(["", "keep_new", "apply_old", "scaled_old"]);
  fireEvent.change(restricted, { target: { value: "keep_new" } });
  await waitFor(() => expect(call).toHaveBeenCalledWith("upgrade_resolve", { key: "mountain_corridor", choice: "keep_new" }));
  await waitFor(() => expect(onPlan).toHaveBeenCalledWith(plan));
});

it("blocks committing a migration while an unreviewed frontend Draft exists", () => {
  const plan: MigrationPlan = {
    items: [], new_locations: [], removed_locations: [], ownership_changes: {},
    tag_candidates: [], confirmed_tag_mappings: {}, acknowledged_topology: true,
  };
  const call = vi.fn();
  const onCommit = vi.fn();
  const view = render(<MigrationDialog plan={plan} onPlan={vi.fn()} onCommit={onCommit} onClose={vi.fn()} call={call as any} hasPendingDrafts />);
  expect(screen.getByRole("alert").textContent).toContain("Apply or discard all pending Draft edits");
  const commit = screen.getByRole("button", { name: "Commit migration" }) as HTMLButtonElement;
  expect(commit.disabled).toBe(true);
  fireEvent.click(commit);
  expect(call).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
  view.rerender(<MigrationDialog plan={plan} onPlan={vi.fn()} onCommit={onCommit} onClose={vi.fn()} call={call as any} hasPendingDrafts={false} />);
  expect((screen.getByRole("button", { name: "Commit migration" }) as HTMLButtonElement).disabled).toBe(false);
});

it("shows migration counts in people and explicitly labels source-unit details", () => {
  const row = { type: "peasants", culture: "amber", religion: "sun", size: "1.2505" };
  const plan: MigrationPlan = {
    items: [{ ...item("alpha", "Safe — unchanged vanilla"), old_total: "1.2505", new_total: "1.2505", old_vanilla: [row], old_modified: [row], new_vanilla: [row], proposal: [row] }],
    new_locations: [], removed_locations: [], ownership_changes: {}, tag_candidates: [], confirmed_tag_mappings: {}, acknowledged_topology: true,
  };
  render(<MigrationDialog plan={plan} onPlan={vi.fn()} onCommit={vi.fn()} onClose={vi.fn()} call={vi.fn() as any} />);
  expect(screen.getByText(/Old total 1,250.5 → new total 1,250.5 people/)).toBeTruthy();
  expect(screen.getAllByText("1,250.5")).toHaveLength(3);
  expect(screen.getAllByText("Full source fields (size in game units)")).toHaveLength(3);
  expect(screen.getAllByText(/Includes fractional source rows/)).toHaveLength(3);
});

it("keeps migration review modal and its acknowledgment stable until commit completes", async () => {
  const plan: MigrationPlan = {
    items: [], new_locations: [], removed_locations: [], ownership_changes: {},
    tag_candidates: [], confirmed_tag_mappings: {}, acknowledged_topology: true,
  };
  let finishCommit!: () => void;
  const call = vi.fn(async (method: string) => {
    if (method === "upgrade_commit") await new Promise<void>(resolve => { finishCommit = resolve; });
  });
  const onClose = vi.fn(), onCommit = vi.fn();
  render(<MigrationDialog plan={plan} onPlan={vi.fn()} onCommit={onCommit} onClose={onClose} call={call as any} />);
  fireEvent.click(screen.getByRole("button", { name: "Commit migration", exact: true }));
  await waitFor(() => expect(call).toHaveBeenCalledWith("upgrade_commit"));
  const close = screen.getByRole("button", { name: "Close dialog" }) as HTMLButtonElement;
  expect(close.disabled).toBe(true);
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(close);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(onClose).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
  await act(async () => finishCommit());
  expect(onCommit).toHaveBeenCalledOnce();
});
