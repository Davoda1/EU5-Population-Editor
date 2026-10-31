import { randomUUID } from "node:crypto";
import type { ConfirmationPrompt } from "../../src/types/api";

type Pending = {
  prompt: ConfirmationPrompt;
  resolve: (proceed: boolean) => void;
  saving: boolean;
};

/** Main-owned confirmation state. No renderer response can create a request. */
export class ConfirmationController {
  private pending: Pending | null = null;
  constructor(
    private publish: (prompt: ConfirmationPrompt | null, token: string) => void,
    private save: () => Promise<boolean>,
  ) {}

  ask(details: Omit<ConfirmationPrompt, "token" | "error">): Promise<boolean> {
    if (this.pending) return Promise.resolve(false);
    return new Promise((resolve) => {
      const prompt = { ...details, token: randomUUID(), error: "" };
      this.pending = { prompt, resolve, saving: false };
      try { this.publish(prompt, prompt.token); }
      catch { this.abort(); }
    });
  }

  async respond(token: unknown, action: unknown): Promise<void> {
    const pending = this.pending;
    if (!pending || typeof token !== "string" || token !== pending.prompt.token)
      throw new Error("Confirmation is no longer active");
    if (!["cancel", "discard", "save"].includes(String(action)) || typeof action !== "string")
      throw new Error("Unsupported confirmation action");
    if (pending.saving) throw new Error("Save is already in progress");
    if (action === "cancel" || action === "discard") {
      this.finish(pending, action === "discard");
      return;
    }
    if (!pending.prompt.canSave) throw new Error("Working changes cannot be saved right now");
    pending.saving = true;
    try {
      const saved = await this.save();
      // A renderer crash or shutdown must never resume an earlier operation.
      if (this.pending !== pending) return;
      if (saved) this.finish(pending, true);
      else pending.prompt.error = "Save was canceled. Your current work is still open.";
    } catch (error) {
      if (this.pending !== pending) return;
      pending.prompt.error = `Could not save. Your current work is still open. ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (this.pending === pending) {
        pending.saving = false;
        this.publish({ ...pending.prompt }, pending.prompt.token);
      }
    }
  }

  abort(): void {
    if (this.pending) this.finish(this.pending, false);
  }

  private finish(pending: Pending, proceed: boolean): void {
    if (this.pending !== pending) return;
    this.pending = null;
    pending.resolve(proceed);
    try { this.publish(null, pending.prompt.token); }
    catch { /* The renderer may already be gone; cancellation still completes. */ }
  }
}
