import { describe, expect, it } from "vitest";
import { formatPeople, gameToPeople, hasFractionalPeople, peopleToGame } from "../src/state/population-units";
import { operation, type DraftForm } from "../src/features/DraftEditor";

describe("people and source-unit conversion", () => {
  it("converts one person, totals and signed differences exactly", () => {
    expect(gameToPeople("0.001")).toBe("1");
    expect(gameToPeople("7.001")).toBe("7001");
    expect(formatPeople("1234.567")).toBe("1,234,567");
    expect(formatPeople("-7.001")).toBe("-7,001");
    expect(peopleToGame("1")).toBe("0.001");
    expect(peopleToGame("7001")).toBe("7.001");
    expect(peopleToGame("-1", true)).toBe("-0.001");
    expect(peopleToGame(" 0000 ")).toBe("0");
  });

  it("preserves values beyond Number precision and fractional source data", () => {
    const count = "9007199254740993001";
    expect(peopleToGame(count)).toBe("9007199254740993.001");
    expect(gameToPeople(peopleToGame(count))).toBe(count);
    expect(formatPeople("0.0005")).toBe("0.5");
    expect(formatPeople("1.2345678901234567890123456789")).toBe("1,234.5678901234567890123456789");
    expect(hasFractionalPeople("0.0005")).toBe(true);
    expect(hasFractionalPeople("0.0010")).toBe(false);
    expect(hasFractionalPeople("0")).toBe(false);
  });

  it("rejects fractional or malformed absolute inputs instead of rounding", () => {
    for (const value of ["0.5", "1.0", "1,000", "1e3", "", "--1", "NaN", "Infinity"])
      expect(() => peopleToGame(value)).toThrow("whole number of people");
    expect(() => peopleToGame("-1")).toThrow("cannot be negative");
    expect(() => peopleToGame("9".repeat(132))).toThrow("too large");
  });
});

describe("editor operation unit boundary", () => {
  const form = {
    kind: "exact", tuple: "peasants|amber|sun", mode: "set", value: "7001",
    type: "peasants", culture: "amber", religion: "sun", axis: "culture",
    weights: "amber = 1.5\nblue = 2.5", advanced: false, reviewed: false,
  } as DraftForm;

  it("converts only absolute population inputs to the existing IPC unit", () => {
    expect(operation(form)).toEqual({ kind: "exact", tuple: form.tuple, mode: "set", value: "7.001" });
    expect(operation({ ...form, mode: "add", value: "-1" }).value).toBe("-0.001");
    expect(operation({ ...form, kind: "scale", value: "12345" })).toEqual({ kind: "scale", mode: "set", value: "12.345" });
    expect(operation({ ...form, kind: "scale", mode: "add", value: "-25" }).value).toBe("-0.025");
    expect(operation({ ...form, kind: "add", value: "500" }).size).toBe("0.5");
    expect(() => operation({ ...form, value: "0.5" })).toThrow("whole number");
    expect(() => operation({ ...form, kind: "add", value: "-1" })).toThrow("cannot be negative");
  });

  it("retains decimal percentages, multipliers and weights", () => {
    for (const kind of ["exact", "scale"] as const) {
      expect(operation({ ...form, kind, mode: "percent", value: "12.5" }).value).toBe("12.5");
      expect(operation({ ...form, kind, mode: "multiply", value: "1.5" }).value).toBe("1.5");
    }
    expect(operation({ ...form, kind: "rebalance" }).weights).toEqual({ amber: "1.5", blue: "2.5" });
  });
});
