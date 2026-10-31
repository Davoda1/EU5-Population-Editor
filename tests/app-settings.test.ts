// @vitest-environment node
import { expect, it } from "vitest";
import { defaultPreferences, readPreferences, windowBounds } from "../electron/main/app-settings";

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const left = { x: -1600, y: -200, width: 1600, height: 900 };

it("migrates dimensions and independent folder preferences while centering an unknown legacy position", () => {
  const prefs = readPreferences({ theme: "dark", width: 1200, height: 800, gameDir: "/games/EU5", projectDir: "/projects" });
  expect(prefs).toEqual({ ...defaultPreferences(), theme: "dark", gameDir: "/games/EU5", projectDir: "/projects", geometry: { width: 1200, height: 800, maximized: false } });
  expect(windowBounds(prefs.geometry, [primary, left], primary)).toEqual({ x: 360, y: 120, width: 1200, height: 800 });
});

it("clears disabled restoration data and respects an explicit geometry reset", () => {
  const saved = { geometry: { x: -1500, y: -100, width: 1100, height: 800, maximized: true }, projectDir: "/projects", exportDir: "/exports", gameDir: "/games/EU5" };
  const prefs = readPreferences({ ...saved, rememberWindow: false, rememberFolders: false, autoLoad: false });
  expect(prefs.geometry).toBeNull();
  expect(prefs.projectDir).toBe("");
  expect(prefs.exportDir).toBe("");
  expect(prefs.gameDir).toBe("/games/EU5");
  expect(prefs.autoLoad).toBe(false);
  expect(readPreferences({ geometry: null, width: 1000, height: 700 }).geometry).toBeNull();
});

it("rejects malformed preferences and keeps safe defaults", () => {
  for (const value of [null, [], "text", 5]) expect(readPreferences(value)).toEqual(defaultPreferences());
  expect(readPreferences({ theme: "invalid", gameDir: "bad\u0000path", rememberWindow: "false", autoLoad: null, geometry: { x: Infinity, y: 0, width: NaN, height: 800 } })).toEqual(defaultPreferences());
  expect(readPreferences({ geometry: { x: Infinity, y: 10, width: 1200, height: 800, maximized: true } }).geometry).toEqual({ width: 1200, height: 800, maximized: true });
});

it("preserves a secondary monitor's negative coordinates and normal bounds while maximized", () => {
  const prefs = readPreferences({ geometry: { x: -1500, y: -150, width: 1200, height: 800, maximized: true } });
  expect(prefs.geometry?.maximized).toBe(true);
  expect(windowBounds(prefs.geometry, [primary, left], primary)).toEqual({ x: -1500, y: -150, width: 1200, height: 800 });
});

it("recovers a removed display by centering the normal size on the primary work area", () => {
  const saved = { x: -1500, y: -150, width: 1200, height: 800, maximized: false };
  expect(windowBounds(saved, [primary], primary)).toEqual({ x: 360, y: 120, width: 1200, height: 800 });
});

it("fits changed work areas without leaving controls offscreen", () => {
  const saved = { x: 1750, y: 900, width: 1500, height: 1000, maximized: false };
  expect(windowBounds(saved, [primary], primary)).toEqual({ x: 420, y: 40, width: 1500, height: 1000 });
  const small = { x: 20, y: 30, width: 800, height: 600 };
  expect(windowBounds(null, [small], small)).toEqual(small);
  expect(windowBounds({ x: 30, y: 50, width: 20, height: 40, maximized: false }, [primary], primary)).toEqual({ x: 30, y: 50, width: 960, height: 680 });
});
