import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DraftEditor, defaultForm } from "../src/features/DraftEditor";
import type { Status, Location } from "../src/types/api";
afterEach(cleanup);
const location: Location = {
  key: "alpha",
  name: "Alpha",
  owners: ["AAA"],
  original: {
    t: { type: "peasants", culture: "amber", religion: "sun", size: "7" },
  },
  working: {
    t: { type: "peasants", culture: "amber", religion: "sun", size: "8" },
  },
  draft: null,
  original_total: "7",
  working_total: "8",
  draft_total: null,
  draft_token: null,
  region: null,
  map_dimensions: null,
};
const status = {
  definitions: {
    type: ["peasants"],
    culture: ["amber", "blue"],
    religion: ["sun"],
  },
} as Status;
it("typing changes Draft form without invoking Apply", () => {
  const apply = vi.fn(),
    change = vi.fn();
  const form = {
    ...defaultForm(location, status),
    kind: "exact" as const,
    mode: "set",
    value: "8",
  };
  render(
    <DraftEditor
      location={location}
      status={status}
      form={form}
      onChange={change}
      onReview={vi.fn()}
      onApply={apply}
      onDiscard={vi.fn()}
      busy={false}
    />,
  );
  fireEvent.change(screen.getByLabelText("Draft value"), {
    target: { value: "12.34" },
  });
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({ value: "12.34", reviewed: false }),
  );
  expect(apply).not.toHaveBeenCalled();
  expect((screen.getByText("Apply") as HTMLButtonElement).disabled).toBe(true);
});
it("requires a reviewed backend preview token before Apply", () => {
  const apply = vi.fn();
  const draft = {
    ...location,
    draft: location.working,
    draft_total: "8",
    draft_token: 5,
  };
  const form = { ...defaultForm(location, status), reviewed: true };
  render(
    <DraftEditor
      location={draft}
      status={status}
      form={form}
      onChange={vi.fn()}
      onReview={vi.fn()}
      onApply={apply}
      onDiscard={vi.fn()}
      busy={false}
    />,
  );
  fireEvent.click(screen.getByText("Apply"));
  expect(apply).toHaveBeenCalledOnce();
});
it("Discard is explicit and separate from Review and Apply", () => {
  const discard = vi.fn(),
    review = vi.fn(),
    apply = vi.fn();
  render(
    <DraftEditor
      location={location}
      status={status}
      form={defaultForm(location, status)}
      onChange={vi.fn()}
      onReview={review}
      onApply={apply}
      onDiscard={discard}
      busy={false}
    />,
  );
  fireEvent.click(screen.getByText("Discard"));
  expect(discard).toHaveBeenCalledOnce();
  expect(review).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});
