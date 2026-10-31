// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GameVersionSettings } from "../electron/main/game-version-settings";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "eu5-version-"));
  roots.push(root);
  const install = join(root, "Installation Ω"), game = join(install, "game");
  await mkdir(game, { recursive: true });
  const file = join(root, "profile", "game-versions.json");
  return { root, install, game, file };
}

it("persists manual edits across restarts and installation/game aliases without sharing other installs", async () => {
  const { root, install, game, file } = await fixture();
  const settings = new GameVersionSettings(file);
  expect(await settings.activate(install)).toEqual({ version: "1.4.5", source: "manual" });
  expect(await settings.set(" v1.4.6 ")).toEqual({ version: "1.4.6", source: "manual" });

  const restarted = new GameVersionSettings(file);
  expect(await restarted.activate(game)).toEqual({ version: "1.4.6", source: "manual" });
  const second = join(root, "Another installation", "game");
  await mkdir(second, { recursive: true });
  expect((await restarted.activate(second)).version).toBe("1.4.5");
  await restarted.set("1.5.0");

  const again = new GameVersionSettings(file);
  expect((await again.activate(install)).version).toBe("1.4.6");
  expect((await again.activate(second)).version).toBe("1.5.0");
  expect(Object.keys(JSON.parse(await readFile(file, "utf8")))).toHaveLength(2);
  expect(await readdir(game)).toEqual([]); // preferences never touch game data
  expect(await readdir(install)).toEqual(["game"]);
});

it("rejects invalid manual labels without overwriting a saved version", async () => {
  const { install, file } = await fixture();
  const settings = new GameVersionSettings(file);
  await expect(settings.set("1.4.5")).rejects.toThrow("Load game data");
  await settings.activate(install);
  for (const input of ["1.0", "develop", "42f8b31e", "1.4.5 beta", "1.4.*", "0.0.0", "1.4.70000", null]) {
    await expect(settings.set(input)).rejects.toThrow("Enter an EU5 version");
  }
  expect((await new GameVersionSettings(file).activate(install)).version).toBe("1.4.5");
  settings.clear();
  expect(() => settings.current()).toThrow("Load game data");
});

it("recovers safely from malformed settings instead of treating arbitrary metadata as a game release", async () => {
  const { install, file } = await fixture();
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, "{broken json", "utf8");
  expect((await new GameVersionSettings(file).activate(install)).version).toBe("1.4.5");
  await writeFile(file, JSON.stringify({ [join(install, "game")]: "1.0" }), "utf8");
  expect((await new GameVersionSettings(file).activate(install)).version).toBe("1.4.5");
});
