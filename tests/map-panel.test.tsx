import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MapPanel } from "../src/features/MapPanel";
import type { Bridge, Location } from "../src/types/api";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
const location: Location = {
  key: "alpha", name: "Alpha City", owners: ["ALP"], original: {}, working: {}, draft: null,
  original_total: "10", working_total: "10", draft_total: null, draft_token: null,
  region: { min_x: 900, max_x: 999, min_y: 450, max_y: 499, area: 5000, sum_x: 0, sum_y: 0 },
  map_dimensions: [2000, 1200],
};
type Hit = { locations: string[]; labels: string[]; selectable_locations: string[]; kinds: string[] };
let hit: Hit;
let request: ReturnType<typeof vi.fn>;
let onSelect: ReturnType<typeof vi.fn>;
let onError: ReturnType<typeof vi.fn>;
let captureDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("PointerEvent", MouseEvent);
  captureDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "setPointerCapture");
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  hit = { locations: ["alpha"], labels: ["Alpha City"], selectable_locations: ["alpha"], kinds: ["land"] };
  request = vi.fn(async (method) => {
    if (method === "map_tile") return { image };
    if (method === "map_hit") return hit;
    throw new Error(`Unexpected request: ${method}`);
  });
  window.eu5 = { request } as unknown as Bridge;
  onSelect = vi.fn(); onError = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers(); vi.unstubAllGlobals();
  if (captureDescriptor) Object.defineProperty(HTMLElement.prototype, "setPointerCapture", captureDescriptor);
  else delete (HTMLElement.prototype as any).setPointerCapture;
});
const advance = (ms = 150) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
async function mount() {
  render(<MapPanel location={location} onSelect={onSelect} onError={onError} />);
  await advance();
  const map = screen.getByRole("application");
  vi.spyOn(map, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360, toJSON() {} });
  return map;
}
async function clickMap(map: HTMLElement) {
  fireEvent.pointerMove(map, { clientX: 200, clientY: 150, pointerId: 1 });
  fireEvent.pointerDown(map, { clientX: 200, clientY: 150, pointerId: 1 });
  fireEvent.pointerUp(map, { clientX: 200, clientY: 150, pointerId: 1 });
  await advance();
}
const tiles = () => request.mock.calls.filter(([method]) => method === "map_tile").map(([, params]) => params);

it.each([
  ["sea", "south_sea", "South Sea"],
  ["lake", "blue_lake", "Blue Lake"],
  ["impassable", "mountain_corridor", "Mountain Corridor"],
  ["non_ownable", "wasteland_corridor", "Wasteland Corridor"],
])("retains the current selection when a %s map region is clicked and explains why", async (kind, key, label) => {
  hit = { locations: [key], labels: [label], selectable_locations: [], kinds: [kind] };
  const map = await mount();
  await clickMap(map);
  expect(onSelect).not.toHaveBeenCalled();
  expect(map.textContent).toContain(label);
  expect(map.textContent).toMatch(/not selectable/i);
  expect(onError).not.toHaveBeenCalled();
});

it("keeps panning and wheel zoom active when the pointer is over nonselectable terrain", async () => {
  hit = { locations: ["mountain_corridor"], labels: ["Mountain Corridor"], selectable_locations: [], kinds: ["impassable"] };
  const map = await mount();
  fireEvent.pointerMove(map, { clientX: 200, clientY: 150, pointerId: 1 });
  await advance();
  expect(map.textContent).toContain("Mountain Corridor");
  const before = tiles().at(-1);
  fireEvent.pointerDown(map, { clientX: 200, clientY: 150, pointerId: 1 });
  fireEvent.pointerMove(map, { clientX: 300, clientY: 190, pointerId: 1 });
  fireEvent.pointerUp(map, { clientX: 300, clientY: 190, pointerId: 1 });
  await advance();
  const panned = tiles().at(-1);
  expect(panned.x).toBeLessThan(before.x);
  expect(panned.y).toBeLessThan(before.y);
  expect(panned.width).toBe(before.width);
  fireEvent.wheel(map, { deltaY: -100, clientX: 300, clientY: 190 });
  await advance();
  expect(tiles().at(-1).width).toBeLessThan(panned.width);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it("selects an ordinary uniquely identified editable land location", async () => {
  hit = { locations: ["beta"], labels: ["Beta City"], selectable_locations: ["beta"], kinds: ["land"] };
  await clickMap(await mount());
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("beta");
});

it("consumes vertical wheel scrolling using the latest view and removes its listener on unmount", async () => {
  const map = await mount();
  const initialWidth = tiles().at(-1).width;
  const horizontal = new WheelEvent("wheel", { deltaX: 100, bubbles: true, cancelable: true });
  fireEvent(map, horizontal);
  await advance();
  expect(horizontal.defaultPrevented).toBe(false);
  expect(tiles().at(-1).width).toBe(initialWidth);

  for (const expectedWidth of [544, 462]) {
    const vertical = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    fireEvent(map, vertical);
    await advance();
    expect(vertical.defaultPrevented).toBe(true);
    expect(tiles().at(-1).width).toBe(expectedWidth);
  }
  cleanup();
  const detached = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
  fireEvent(map, detached);
  expect(detached.defaultPrevented).toBe(false);
});

it("does not turn a shared RGB into a unique hit by filtering out blocked locations", async () => {
  hit = { locations: ["beta", "sea_alias"], labels: ["Beta City", "Shared Sea"], selectable_locations: ["beta"], kinds: ["land", "sea"] };
  const map = await mount();
  await clickMap(map);
  expect(onSelect).not.toHaveBeenCalled();
  expect(map.textContent).toMatch(/ambiguous/i);
  expect(map.textContent).toContain("beta");
  expect(map.textContent).toContain("sea_alias");
});

it("rejects a unique hit whose selectable identifier does not match the original hit", async () => {
  hit = { locations: ["south_sea"], labels: ["South Sea"], selectable_locations: ["beta"], kinds: ["sea"] };
  await clickMap(await mount());
  expect(onSelect).not.toHaveBeenCalled();
});


it("does not treat a drag that returns to its starting point as a selection click", async () => {
  hit = { locations: ["beta"], labels: ["Beta City"], selectable_locations: ["beta"], kinds: ["land"] };
  const map = await mount();
  fireEvent.pointerDown(map, { clientX: 200, clientY: 150, pointerId: 1 });
  fireEvent.pointerMove(map, { clientX: 280, clientY: 190, pointerId: 1 });
  fireEvent.pointerMove(map, { clientX: 200, clientY: 150, pointerId: 1 });
  fireEvent.pointerUp(map, { clientX: 200, clientY: 150, pointerId: 1 });
  await advance();
  expect(onSelect).not.toHaveBeenCalled();
});

it("cancels a captured drag without turning the later pointer-up into a click", async () => {
  const map = await mount();
  fireEvent.pointerDown(map, { clientX: 200, clientY: 150, pointerId: 1 });
  fireEvent.pointerCancel(map, { pointerId: 1 });
  fireEvent.pointerUp(map, { clientX: 200, clientY: 150, pointerId: 1 });
  await advance();
  expect(onSelect).not.toHaveBeenCalled();
});
