import { describe, it, expect } from "vitest";
import {
  difference,
  add,
  percent,
  comparison,
  summary,
} from "../src/state/comparison";
import { operation } from "../src/features/DraftEditor";
import type { DraftForm } from "../src/features/DraftEditor";
import type { Location } from "../src/types/api";
export const location: Location = {
  key: "alpha",
  name: "Alpha",
  owners: ["AAA"],
  original: {
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
  },
  working: {
    "peasants|amber|sun": {
      type: "peasants",
      culture: "amber",
      religion: "sun",
      size: "8.001",
    },
  },
  draft: null,
  original_total: "8",
  working_total: "8.001",
  draft_total: null,
  draft_token: null,
  region: null,
  map_dimensions: null,
};
describe("exact display arithmetic", () => {
  it("avoids binary floating point drift", () => {
    expect(add("0.1", "0.2")).toBe("0.3");
    expect(difference("9007199254740993.000000001", "9007199254740993")).toBe(
      "0.000000001",
    );
  });
  it("handles negative deltas and zero denominators", () => {
    expect(difference("0", "1.001")).toBe("-1.001");
    expect(percent("7", "10")).toBe("70%");
    expect(percent("1", "0")).toBe("—");
  });
  it("joins missing and removed tuples", () => {
    const rows = comparison(location);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.row.type === "clergy")?.working).toBe("0");
  });
  it("keeps pending removals visible", () => {
    const l = { ...location, draft: {}, draft_total: "0" };
    expect(comparison(l).find((r) => r.row.type === "peasants")?.draft).toBe(
      "0",
    );
  });
  it("summarizes exact totals", () => {
    expect(summary(location.original, "culture")).toEqual({ amber: "8" });
  });
  it("summarizes valid definition IDs that overlap JavaScript object properties", () => {
    const row = location.original["peasants|amber|sun"];
    const totals = summary({
      one: { ...row, culture: "constructor", size: "0.001" },
      two: { ...row, culture: "constructor", size: "0.002" },
      three: { ...row, culture: "__proto__", size: "0.003" },
    }, "culture");
    expect(Object.keys(totals).sort()).toEqual(["__proto__", "constructor"]);
    expect(totals.constructor).toBe("0.003");
    expect(totals.__proto__).toBe("0.003");
  });
});
describe("draft request validation", () => {
  const form = {
    kind: "rebalance",
    axis: "culture",
    weights: "amber = 7\nblue = 3",
    advanced: false,
  } as DraftForm;
  it("sends weights as strings", () =>
    expect(operation(form)).toEqual({
      kind: "rebalance",
      axis: "culture",
      weights: { amber: "7", blue: "3" },
      advanced: false,
    }));
  it("rejects duplicate groups", () =>
    expect(() => operation({ ...form, weights: "amber=7\namber=3" })).toThrow(
      "Duplicate",
    ));
  it("rejects malformed input instead of clamping", () =>
    expect(() => operation({ ...form, weights: "amber=-3" })).toThrow());
  it("accepts valid group IDs that overlap JavaScript object properties", () => {
    const weights = operation({ ...form, weights: "constructor=1\n__proto__=2" }).weights;
    expect(JSON.stringify(weights)).toBe('{"constructor":"1","__proto__":"2"}');
    expect(() => operation({ ...form, weights: "__proto__=1\n__proto__=2" })).toThrow("Duplicate");
  });
});
