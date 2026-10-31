import {
  readFile,
  writeFile,
  mkdir,
  rename,
  realpath,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GameVersionPreference } from "../../src/types/api";

// Verified initial game-version baseline; users can save a different version
// for each installation. This is not automatic version detection.
export const DEFAULT_GAME_VERSION = "1.4.5";

export function normalizeGameVersion(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Enter an EU5 version such as 1.4.5.");
  const version = value.trim().replace(/^v/i, "");
  if (!/^\d{1,5}\.\d{1,5}\.\d{1,5}(?:\.\d{1,5})?$/.test(version))
    throw new Error("Enter an EU5 version such as 1.4.5.");
  const parts = version.split(".").map(Number);
  if (parts.some((part) => part > 65535) || parts.every((part) => part === 0))
    throw new Error("Enter an EU5 version such as 1.4.5.");
  if (parts.length === 4 && parts[3] === 0) parts.pop();
  return parts.join(".");
}

/** Manual preferences only: never read executables or modify game/project data. */
export class GameVersionSettings {
  private values: Record<string, string> = Object.create(null);
  private initialized = false;
  private active = "";
  private writes = Promise.resolve();

  constructor(private readonly file: string) {}

  private async initialize() {
    if (this.initialized) return;
    try {
      const data: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (data && typeof data === "object" && !Array.isArray(data)) {
        for (const [key, value] of Object.entries(data)) {
          try {
            this.values[key] = normalizeGameVersion(value);
          } catch {
            /* discard invalid entries */
          }
        }
      }
    } catch (error) {
      if (
        !(error instanceof SyntaxError) &&
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      )
        throw error;
    }
    this.initialized = true;
  }

  async activate(selectedPath: string): Promise<GameVersionPreference> {
    await this.initialize();
    let gamePath = selectedPath;
    try {
      if ((await stat(join(selectedPath, "game"))).isDirectory())
        gamePath = join(selectedPath, "game");
    } catch {
      /* selectedPath itself is the game directory */
    }
    const canonical = await realpath(gamePath);
    const key =
      process.platform === "win32" ? canonical.toLowerCase() : canonical;
    if (!Object.hasOwn(this.values, key)) {
      // Save the default once, so a later editor update cannot silently replace it.
      await this.save(key, DEFAULT_GAME_VERSION);
    }
    this.active = key;
    return this.current();
  }

  current(): GameVersionPreference {
    if (!this.active) throw new Error("Load game data before setting its version.");
    return { version: this.values[this.active], source: "manual" };
  }

  async set(value: unknown): Promise<GameVersionPreference> {
    this.current();
    const version = normalizeGameVersion(value);
    await this.save(this.active, version);
    return this.current();
  }

  clear() {
    this.active = "";
  }

  private async save(key: string, version: string) {
    const operation = this.writes.catch(() => {}).then(async () => {
      const values = { ...this.values, [key]: version };
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + ".tmp", JSON.stringify(values), "utf8");
      await rename(this.file + ".tmp", this.file);
      this.values = values;
    });
    this.writes = operation;
    await operation;
  }
}
