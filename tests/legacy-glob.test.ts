// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import { createRequire } from "node:module";
import { closeSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
// Resolve exactly the dependency used by the installed legacy rimraf package.
const legacyRequire = createRequire(require.resolve("rimraf"));
const glob = legacyRequire("glob");
const rimraf = require("rimraf");
const temp = require("temp");
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "EU5 glob ü "));
  mkdirSync(join(root, "nested"));
  for (const name of ["a.tmp", "b.tmp", "keep.txt", ".hidden.tmp", "nested/c.tmp", "nested/keep.txt"])
    writeFileSync(join(root, name), "fixture");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function collect(pattern: string, options: Record<string, unknown> = {}) {
  return new Promise<string[]>((resolve, reject) => {
    glob(pattern, options, (error: unknown, matches: string[]) => error ? reject(error) : resolve(matches));
  });
}

it("uses the local adapter backed by patched glob and preserves traversal options", async () => {
  expect(legacyRequire.resolve("glob").replaceAll("\\", "/")).toContain("/scripts/vendor/legacy-glob/index.cjs");
  expect(require("secure-glob/package.json").version).toBe("14.0.3");
  const options = { cwd: root, dot: true, nodir: true, ignore: "nested/**" };
  const expected = [".hidden.tmp", "a.tmp", "b.tmp"];
  expect(await collect("**/*.tmp", options)).toEqual(expected);
  expect(glob.sync("**/*.tmp", options)).toEqual(expected);
  expect(glob.sync("*.tmp", { cwd: root, nosort: true }).sort()).toEqual(["a.tmp", "b.tmp"]);
  expect(options).toEqual({ cwd: root, dot: true, nodir: true, ignore: "nested/**" });
  expect(await collect("absent*.tmp", { cwd: root })).toEqual([]);
});

it("supports the callback-only overload and reports errors once asynchronously", async () => {
  const files = await new Promise<string[]>((resolve, reject) => {
    glob(join(root, "*.tmp"), (error: unknown, matches: string[]) => error ? reject(error) : resolve(matches));
  });
  expect(files.map((file: string) => file.replaceAll("\\", "/").split("/").at(-1))).toEqual(["a.tmp", "b.tmp"]);
  let calls = 0;
  let synchronous = true;
  const failure = new Promise<void>(resolve => {
    glob(null, {}, (error: unknown, matches: unknown) => {
      calls++;
      expect(synchronous).toBe(false);
      expect(error).toBeInstanceOf(Error);
      expect(matches).toBeUndefined();
      resolve();
    });
  });
  synchronous = false;
  await failure;
  await Promise.resolve();
  expect(calls).toBe(1);
  expect(() => glob.sync(null)).toThrow();
});

it("propagates cancellation without returning a successful partial traversal", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Cancelled fixture traversal"));
  await expect(collect("**/*", { cwd: root, signal: controller.signal })).rejects.toThrow("Cancelled fixture traversal");
});

it("preserves brace magic and Windows separator handling for rimraf patterns", async () => {
  expect(glob.hasMagic("{a,b}.tmp")).toBe(true);
  expect(glob.hasMagic("ordinary.txt")).toBe(false);
  expect(glob.hasMagic("literal\\*.tmp", { platform: "linux" })).toBe(false);
  expect(glob.hasMagic("C:\\Temp\\EU5 tests\\*.tmp", { platform: "win32" })).toBe(true);
  expect(glob.hasMagic("C:\\Temp\\EU5 tests\\literal.txt", { platform: "win32" })).toBe(false);
  expect(glob.hasMagic("\\\\server\\share\\*.tmp", { platform: "win32" })).toBe(true);
  const options = { cwd: root, windowsPathsNoEscape: true };
  // glob returns native separators unless POSIX output is explicitly requested.
  const nativeMatch = [join("nested", "c.tmp")];
  expect(glob.sync("nested\\*.tmp", options)).toEqual(nativeMatch);
  expect(await collect("nested\\*.tmp", options)).toEqual(nativeMatch);
  const posixOptions = { ...options, posix: true };
  expect(glob.sync("nested\\*.tmp", posixOptions)).toEqual(["nested/c.tmp"]);
  expect(await collect("nested\\*.tmp", posixOptions)).toEqual(["nested/c.tmp"]);
});

it("runs actual legacy rimraf sync and callback cleanup without changing unmatched files", async () => {
  rimraf.sync(join(root, "{a,b}.tmp"));
  expect(existsSync(join(root, "a.tmp"))).toBe(false);
  expect(existsSync(join(root, "b.tmp"))).toBe(false);
  expect(existsSync(join(root, "keep.txt"))).toBe(true);
  await new Promise<void>((resolve, reject) => {
    rimraf(join(root, "nested", "*.tmp"), (error: unknown) => error ? reject(error) : resolve());
  });
  expect(readdirSync(join(root, "nested"))).toEqual(["keep.txt"]);
  // Literal existing names containing glob characters must remain literal.
  const literal = join(root, "literal[1]");
  mkdirSync(literal);
  writeFileSync(join(literal, "child.tmp"), "fixture");
  rimraf.sync(literal);
  expect(existsSync(literal)).toBe(false);
  expect(existsSync(join(root, ".hidden.tmp"))).toBe(true);
});

it("cleans tracked Squirrel temp directories through both callback and sync APIs", async () => {
  temp.track();
  const directory = await temp.mkdir({ dir: root, prefix: "Squirrel [fixture] " });
  const file = await temp.open({ dir: root, prefix: "Squirrel [file] " });
  closeSync(file.fd);
  writeFileSync(join(directory, "child.tmp"), "fixture");
  await temp.cleanup();
  expect(existsSync(directory)).toBe(false);
  expect(existsSync(file.path)).toBe(false);
  const syncDirectory = temp.mkdirSync({ dir: root, prefix: "Squirrel [sync] " });
  writeFileSync(join(syncDirectory, "child.tmp"), "fixture");
  temp.cleanupSync();
  expect(existsSync(syncDirectory)).toBe(false);
  expect(existsSync(join(root, "keep.txt"))).toBe(true);
});
