import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.license, "AGPL-3.0-only");
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[""].version, pkg.version);
assert.equal(lock.packages[""].license, pkg.license);
const cargo = await readFile("core/Cargo.toml", "utf8");
assert.equal(cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1], pkg.version);
assert.match(cargo, /^license\s*=\s*"AGPL-3.0-only"/m);
const cargoLock = await readFile("core/Cargo.lock", "utf8");
assert.equal(cargoLock.match(/name = "eu5-population-core"\r?\nversion = "([^"]+)"/)?.[1], pkg.version);
assert.match(await readFile("LICENSE.txt", "utf8"), /GNU AFFERO GENERAL PUBLIC LICENSE/);

const excluded = new Set([".git", "node_modules", "build", "release", "dependencies", "toolings", "third-party", "target"]);
const credential = new RegExp(["github", "_pat_", "[A-Za-z0-9_]{20,}"].join(""));
const personalEmail = /[\w.+-]+@(?:gmail|outlook|hotmail)\.com/i;
let count = 0;
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = join(dir, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Unexpected source symlink: ${path}`);
    if (entry.isDirectory()) { await inspect(path); continue; }
    assert.ok(!/\.(?:eu5popproj|7z|rgb|dat|exe|deb)$/i.test(path), `Unexpected source artifact: ${path}`);
    if (!/\.(?:md|txt|json|rs|ts|tsx|js|mjs|cjs|yml|yaml|toml|sh|ps1|html|css)$/i.test(path)) continue;
    const text = await readFile(path, "utf8");
    assert.ok(!credential.test(text), `Credential found in ${path}`);
    assert.ok(!personalEmail.test(text), `Personal contact address found in ${path}`);
    count++;
  }
}
await inspect(".");
console.log(`Public source checks passed: version ${pkg.version}, AGPLv3, ${count} text files.`);

const { checkManual } = await import("./check-manual.mjs");
await checkManual();
