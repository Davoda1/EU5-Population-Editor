import {
  readFile,
  writeFile,
  mkdir,
  rename,
  realpath,
  stat,
  rm,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, win32 } from "node:path";
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

export function installationPath(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter an installation directory.");
  let path = value.trim();
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1).trim();
  if (!path || path.length > 4096 || /[\u0000-\u001f]/.test(path) || !isAbsolute(path))
    throw new Error("Enter an absolute installation directory.");
  return path;
}

/** Compare equivalent Windows path spellings without changing POSIX case semantics. */
export function installationPreferenceKey(path: string, platform = process.platform): string {
  if (platform !== "win32") return path;
  let normalized = win32.normalize(path);
  if (normalized.slice(0, 8).toUpperCase() === "\\\\?\\UNC\\") normalized = "\\\\" + normalized.slice(8);
  else if (normalized.startsWith("\\\\?\\")) normalized = normalized.slice(4);
  const root = win32.parse(normalized).root;
  if (normalized.length > root.length) normalized = normalized.replace(/[\\]+$/, "");
  return normalized.toLowerCase();
}

async function unavailableInstallationPath(path: string): Promise<string> {
  const absolute = resolve(installationPath(path));
  let ancestor = absolute;
  const suffix: string[] = [];
  while (true) {
    try { return join(await realpath(ancestor), ...suffix); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) return absolute;
      suffix.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}

export async function canonicalInstallationPath(value: unknown): Promise<string> {
  const selectedPath = installationPath(value);
  let gamePath = selectedPath;
  try {
    if ((await stat(join(selectedPath, "game"))).isDirectory())
      gamePath = join(selectedPath, "game");
  } catch { /* selectedPath may be the game directory itself */ }
  const canonical = await realpath(gamePath);
  if (!(await stat(canonical)).isDirectory()) throw new Error("Select an installation directory, not a file.");
  return installationPreferenceKey(canonical);
}

/** Manual preferences only: never read executables or modify game/project data. */
export class GameVersionSettings {
  private values: Record<string, string> = Object.create(null);
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private active = "";
  private writes = Promise.resolve();

  constructor(private readonly file: string) {}

  private async initialize() {
    if (this.initialized) return;
    if (!this.initializing) this.initializing = (async () => {
      try {
        const data: unknown = JSON.parse(await readFile(this.file, "utf8"));
        if (data && typeof data === "object" && !Array.isArray(data)) {
          for (const [key, value] of Object.entries(data)) {
            try {
              this.values[installationPreferenceKey(key)] = normalizeGameVersion(value);
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
    })();
    try { await this.initializing; }
    finally { this.initializing = null; }
  }

  async forPath(selectedPath: string): Promise<GameVersionPreference> {
    await this.initialize();
    if (!selectedPath.trim()) return { version: DEFAULT_GAME_VERSION, source: "manual" };
    let key: string;
    try { key = await canonicalInstallationPath(selectedPath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // Preserve a saved version when a removable installation is unavailable.
      // Resolve the surviving parent so short Windows names, junctions and
      // symlinked library folders still match their saved canonical location.
      const absolute = await unavailableInstallationPath(selectedPath);
      const aliases = [absolute, join(absolute, "game")].map((path) => installationPreferenceKey(path));
      key = aliases.find((path) => Object.hasOwn(this.values, path)) || aliases[0];
    }
    return { version: this.values[key] || DEFAULT_GAME_VERSION, source: "manual" };
  }

  async setForPath(selectedPath: string, value: unknown): Promise<GameVersionPreference> {
    const version = normalizeGameVersion(value);
    await this.initialize();
    const key = await canonicalInstallationPath(selectedPath);
    await this.save(key, version);
    return { version, source: "manual" };
  }

  async saveWithPreferences(
    selectedPath: string,
    value: unknown,
    commitPreferences: () => Promise<void>,
    restorePreferences: () => Promise<void>,
  ): Promise<void> {
    const version = normalizeGameVersion(value);
    await this.initialize();
    const key = await canonicalInstallationPath(selectedPath);
    const operation = this.writes.catch(() => {}).then(async () => {
      const values = { ...this.values, [key]: version };
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + ".tmp", JSON.stringify(values), "utf8");
      let committedPreferences = false;
      try {
        await commitPreferences();
        committedPreferences = true;
        await rename(this.file + ".tmp", this.file);
        this.values = values;
      } catch (error) {
        if (committedPreferences) {
          try { await restorePreferences(); }
          catch { throw new Error("Settings could not be saved or fully restored. Check that the application settings folder is writable before restarting."); }
        }
        throw error;
      } finally {
        await rm(this.file + ".tmp", { force: true }).catch(() => {});
      }
    });
    this.writes = operation;
    await operation;
  }

  async prepare(selectedPath: string): Promise<string> {
    await this.initialize();
    const key = await canonicalInstallationPath(selectedPath);
    if (!Object.hasOwn(this.values, key)) await this.save(key, DEFAULT_GAME_VERSION);
    return key;
  }

  usePrepared(key: string): GameVersionPreference {
    if (!Object.hasOwn(this.values, key)) throw new Error("Installation version was not prepared.");
    this.active = key;
    return this.current();
  }

  async activate(selectedPath: string): Promise<GameVersionPreference> {
    return this.usePrepared(await this.prepare(selectedPath));
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
