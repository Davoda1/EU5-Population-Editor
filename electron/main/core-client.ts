import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
export class CoreClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  constructor(private executable: string) {
    super();
  }
  start() {
    if (this.child) return;
    const child = spawn(this.executable, [], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    const reader = createInterface({ input: child.stdout });
    reader.on("line", (line) => {
      try {
        if (line.length > 32 * 1024 * 1024)
          throw new Error("Core response exceeds 32 MiB");
        const v = JSON.parse(line);
        if (v.event) {
          this.emit("event", v);
          return;
        }
        const p = this.pending.get(v.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(v.id);
        v.error ? p.reject(new Error(v.error.message)) : p.resolve(v.result);
      } catch (e) {
        this.stop(new Error(`Invalid core response: ${e}`));
      }
    });
    child.stderr.on("data", () => {
      /* stdout is protocol-only; stderr may contain private paths, so it is not persisted. */
    });
    child.on("error", (e) =>
      this.stop(
        new Error(
          `Rust core could not start: ${e.message}. Check the sidecar package.`,
        ),
      ),
    );
    child.on("exit", (code, signal) => {
      if (this.child === child) {
        this.child = null;
        this.fail(
          new Error(
            `Rust core stopped (${code ?? signal}). Reopen your saved project after restarting.`,
          ),
        );
        this.emit("event", {
          event: "crash",
          data: {
            message:
              "Core stopped. Unsaved work may be lost; restart and reopen a saved project.",
          },
        });
      }
    });
  }
  request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    this.start();
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(
        () =>
          this.stop(
            new Error(
              `Core ${method} exceeded 15 minutes. Process stopped to prevent a late mutation; reopen saved work.`,
            ),
          ),
        15 * 60 * 1000,
      );
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject, timer });
      const payload = JSON.stringify({ id, method, params }) + "\n";
      if (Buffer.byteLength(payload) > 8 * 1024 * 1024) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("Request exceeds 8 MiB"));
        return;
      }
      this.child!.stdin.write(payload, (e) => {
        if (e) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(e);
        }
      });
    });
  }
  private fail(error: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }
  stop(error = new Error("Core stopped")) {
    const child = this.child;
    this.child = null;
    child?.kill();
    this.fail(error);
  }
}
