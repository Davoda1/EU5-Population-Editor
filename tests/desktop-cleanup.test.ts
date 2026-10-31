// @vitest-environment node
import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { createDesktopCleanup } from "./helpers/desktop-cleanup.mjs";

function setup() {
  const app = Object.assign(new EventEmitter(), {
    process: vi.fn(() => { throw new Error("Playwright process dispatcher was disposed"); }),
    evaluate: vi.fn(),
  });
  return { app, cleanup: createDesktopCleanup(app) };
}

it("does no remote work after the tested Save and exit flow has already closed Electron", async () => {
  const { app, cleanup } = setup();
  app.emit("close");
  await cleanup();
  await cleanup();
  expect(app.process).not.toHaveBeenCalled();
  expect(app.evaluate).not.toHaveBeenCalled();
});

it("forces a still-running app to exit without opening another confirmation", async () => {
  const { app, cleanup } = setup();
  const exit = vi.fn(() => app.emit("close"));
  app.evaluate.mockImplementation(async (callback) => callback({ app: { exit } }));
  await cleanup();
  expect(exit).toHaveBeenCalledWith(0);
  expect(app.process).not.toHaveBeenCalled();
  await cleanup();
  expect(app.evaluate).toHaveBeenCalledOnce();
});

it("handles Electron closing while the cleanup request loses its connection", async () => {
  const { app, cleanup } = setup();
  app.evaluate.mockImplementation(async () => {
    app.emit("close");
    throw new Error("Target closed");
  });
  await cleanup();
  expect(app.process).not.toHaveBeenCalled();
});

it("reports a stuck shutdown instead of waiting indefinitely", async () => {
  vi.useFakeTimers();
  try {
    const { app, cleanup } = setup();
    app.evaluate.mockResolvedValue(undefined);
    const result = expect(cleanup()).rejects.toThrow("Electron test cleanup timed out");
    await vi.advanceTimersByTimeAsync(30000);
    await result;
  } finally {
    vi.useRealTimers();
  }
});
