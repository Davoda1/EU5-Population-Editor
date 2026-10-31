import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
