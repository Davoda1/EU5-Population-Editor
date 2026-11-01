// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { CoreClient } from "../electron/main/core-client";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
    kill: vi.fn(() => true),
  });
}
let child: ReturnType<typeof fakeChild>;
let client: CoreClient;
beforeEach(() => {
  vi.useFakeTimers();
  child = fakeChild();
  vi.mocked(spawn).mockReset().mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  client = new CoreClient("trusted-packaged-core");
});
afterEach(() => {
  client.stop();
  vi.useRealTimers();
});

describe("sidecar protocol bounds", () => {
  it("preserves split UTF-8 characters and multiple responses in one chunk", async () => {
    const event = vi.fn();
    client.on("event", event);
    const first = client.request("status"), second = client.request("location");
    const bytes = Buffer.from('{"event":"progress","data":{"label":"Árvíz"}}\n{"id":1,"result":"人口"}\r\n{"id":2,"result":true}\n');
    const split = bytes.indexOf(Buffer.from("Á")) + 1;
    child.stdout.write(bytes.subarray(0, split));
    child.stdout.write(bytes.subarray(split));
    await expect(first).resolves.toBe("人口");
    await expect(second).resolves.toBe(true);
    expect(event).toHaveBeenCalledWith({ event: "progress", data: { label: "Árvíz" } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an oversized response before an attacker-controlled newline arrives", async () => {
    const pending = client.request("status");
    const rejected = expect(pending).rejects.toThrow("Core response exceeds 32 MiB");
    const chunk = Buffer.alloc(1024 * 1024, 120);
    for (let i = 0; i < 32; i++) child.stdout.write(chunk);
    expect(child.kill).not.toHaveBeenCalled();
    child.stdout.write(Buffer.from("x"));
    expect(child.kill).toHaveBeenCalledOnce();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not leave delayed core-killing timers after unserializable inputs", async () => {
    const active = client.request("status");
    child.stdout.write(Buffer.from('{"id":1,"result":true}\n'));
    await active;
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(client.request("preview", cyclic)).rejects.toThrow();
    await expect(client.request("preview", { value: 1n })).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(child.kill).not.toHaveBeenCalled();
    const next = client.request("status");
    child.stdout.write(Buffer.from('{"id":4,"result":"still running"}\n'));
    await expect(next).resolves.toBe("still running");
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("rejects oversized requests without spawning a process or leaving timers", async () => {
    await expect(client.request("preview", { value: "x".repeat(8 * 1024 * 1024) }))
      .rejects.toThrow("Request exceeds 8 MiB");
    expect(spawn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores output and errors from a stopped process after a restart", async () => {
    const stopped = client.request("status");
    const rejected = expect(stopped).rejects.toThrow("Core stopped");
    client.stop();
    await rejected;
    const replacement = fakeChild();
    vi.mocked(spawn).mockReturnValue(replacement as unknown as ReturnType<typeof spawn>);
    const pending = client.request("status");
    child.stdout.write(Buffer.from('{"id":2,"result":"stale"}\n'));
    child.emit("error", new Error("late process error"));
    expect(replacement.kill).not.toHaveBeenCalled();
    replacement.stdout.write(Buffer.from('{"id":2,"result":"current"}\n'));
    await expect(pending).resolves.toBe("current");
    expect(vi.getTimerCount()).toBe(0);
  });
});
