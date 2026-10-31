// @vitest-environment node
import { expect, it, vi } from "vitest";
import { ConfirmationController } from "../electron/main/confirmation";
import type { ConfirmationPrompt } from "../src/types/api";
const details = { reason: "exit" as const, hasDrafts: true, canSave: true, unavailable: false };
function setup(save = vi.fn(async () => true)) {
  const publish = vi.fn();
  const controller = new ConfirmationController(publish, save);
  const decision = controller.ask(details);
  const prompt = publish.mock.calls[0][0] as ConfirmationPrompt;
  return { controller, publish, save, decision, prompt };
}
it("defaults to retaining work until a valid response and rejects stale or invented tokens", async () => {
  const t = setup();
  await expect(t.controller.respond("unissued-token", "discard")).rejects.toThrow();
  await expect(t.controller.respond(t.prompt.token, "anything")).rejects.toThrow();
  await expect(t.controller.ask(details)).resolves.toBe(false);
  await t.controller.respond(t.prompt.token, "cancel");
  await expect(t.decision).resolves.toBe(false);
  expect(t.save).not.toHaveBeenCalled();
  await expect(t.controller.respond(t.prompt.token, "discard")).rejects.toThrow();
});
it("discards only on explicit confirmation and saves before continuing", async () => {
  const discard = setup();
  await discard.controller.respond(discard.prompt.token, "discard");
  await expect(discard.decision).resolves.toBe(true);
  expect(discard.save).not.toHaveBeenCalled();
  const save = setup();
  await save.controller.respond(save.prompt.token, "save");
  expect(save.save).toHaveBeenCalledOnce();
  await expect(save.decision).resolves.toBe(true);
});
it("keeps the confirmation and current work when the file picker is canceled or save fails", async () => {
  for (const save of [vi.fn(async () => false), vi.fn(async () => { throw new Error("Disk is full"); })]) {
    const t = setup(save);
    let settled = false;
    void t.decision.then(() => { settled = true; });
    await t.controller.respond(t.prompt.token, "save");
    expect(settled).toBe(false);
    expect(t.publish.mock.lastCall?.[0].error).toMatch(/still open/);
    await t.controller.respond(t.prompt.token, "cancel");
    await expect(t.decision).resolves.toBe(false);
  }
});
it("blocks duplicate save responses and never continues after renderer interruption", async () => {
  let finish!: (saved: boolean) => void;
  const t = setup(vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; })));
  const saving = t.controller.respond(t.prompt.token, "save");
  await expect(t.controller.respond(t.prompt.token, "discard")).rejects.toThrow(/in progress/);
  t.controller.abort();
  finish(true);
  await saving;
  await expect(t.decision).resolves.toBe(false);
});
it("does not offer saving when core status cannot be read", async () => {
  const publish = vi.fn();
  const save = vi.fn(async () => true);
  const controller = new ConfirmationController(publish, save);
  const decision = controller.ask({ ...details, canSave: false, unavailable: true });
  await expect(controller.respond(publish.mock.calls[0][0].token, "save")).rejects.toThrow(/cannot be saved/);
  controller.abort();
  await expect(decision).resolves.toBe(false);
  expect(save).not.toHaveBeenCalled();
});
