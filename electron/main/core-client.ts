import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
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
    let response = Buffer.alloc(0);
    let responseLength = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      if (this.child !== child) return;
      try {
        let offset = 0;
        while (offset < chunk.length) {
          const newline = chunk.indexOf(10, offset);
          const end = newline < 0 ? chunk.length : newline;
          const size = responseLength + end - offset;
          // Bound incoming bytes before buffering, including a response that
          // never sends a newline. readline's line event is too late for this.
          if (size > MAX_RESPONSE_BYTES)
            throw new Error("Core response exceeds 32 MiB");
          if (size > response.length) {
            const expanded = Buffer.allocUnsafe(Math.min(MAX_RESPONSE_BYTES,
              Math.max(size, response.length * 2, 64 * 1024)));
            response.copy(expanded, 0, 0, responseLength);
            response = expanded;
          }
          chunk.copy(response, responseLength, offset, end);
          responseLength = size;
          if (newline < 0) break;
          // Decode only complete lines, so split UTF-8 characters stay intact.
          const v = JSON.parse(response.toString("utf8", 0, responseLength));
          responseLength = 0;
          offset = newline + 1;
          if (v.event) this.emit("event", v);
          else {
            const p = this.pending.get(v.id);
            if (p) {
              clearTimeout(p.timer);
              this.pending.delete(v.id);
              v.error ? p.reject(new Error(v.error.message)) : p.resolve(v.result);
            }
          }
          if (this.child !== child) return;
        }
      } catch (e) {
        this.stop(new Error(`Invalid core response: ${e}`));
      }
    });
    child.stderr.on("data", () => {
      /* stdout is protocol-only; stderr may contain private paths, so it is not persisted. */
    });
    child.on("error", (e) => {
      if (this.child !== child) return;
      this.stop(
        new Error(
          `Rust core could not start: ${e.message}. Check the sidecar package.`,
        ),
      );
    });
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
    const id = ++this.sequence;
    let payload: string;
    try {
      payload = JSON.stringify({ id, method, params }) + "\n";
      if (Buffer.byteLength(payload) > MAX_REQUEST_BYTES)
        throw new Error("Request exceeds 8 MiB");
    } catch (error) {
      // Invalid structured-clone inputs (cycles, BigInt) must not leave a
      // pending timeout that later kills an otherwise healthy active core.
      return Promise.reject(error);
    }
    this.start();
    return new Promise((resolve, reject) => {
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
