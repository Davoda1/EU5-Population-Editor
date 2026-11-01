// Explicit maintainer action: refresh a complete frozen manual from local source.
// Normal application builds only run check-manual.mjs and need no Python/network.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkManual, manualHashes } from "./check-manual.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.length !== 3) throw new Error("Usage: node scripts/bundle-manual.mjs <local-manual-source-directory>");
const input = resolve(process.argv[2]);
const { version } = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const inputVersion = (await readFile(join(input, "scripts/build.py"), "utf8")).match(/^VERSION = '([^']+)'/m)?.[1];
assert.equal(inputVersion, version, "Manual source version must match the application before bundling");
const python = process.env.EU5_MANUAL_PYTHON || (process.platform === "win32" ? "python" : "python3");
const staging = await mkdtemp(join(tmpdir(), "eu5-manual-bundle-"));
const destination = join(projectRoot, "docs/manual");
const pending = join(projectRoot, "docs", `.manual-pending-${process.pid}`);
const backup = join(projectRoot, "docs", `.manual-previous-${process.pid}`);
let backedUp = false;
let installed = false;

async function copySource(from, to) {
  const stat = await lstat(from);
  assert.ok(!stat.isSymbolicLink(), `Manual input contains a symlink: ${from}`);
  if (stat.isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
      await copySource(join(from, entry.name), join(to, entry.name));
    }
  } else {
    assert.ok(stat.isFile(), `Unsupported manual input: ${from}`);
    assert.match(from, /\.(?:md|py|js|css|svg|png|txt)$/i, `Unexpected manual source file: ${from}`);
    await mkdir(dirname(to), { recursive: true });
    // Hash the canonical bytes Git will preserve, even when the input came
    // from a Windows checkout or source archive with CRLF text files.
    if (/\.(?:md|py|js|css|svg|txt)$/i.test(from))
      await writeFile(to, (await readFile(from, "utf8")).replace(/\r\n/g, "\n"), "utf8");
    else await cp(from, to);
  }
}

function runPython(script, args = []) {
  const result = spawnSync(python, [script, ...args], { cwd: staging, stdio: "inherit", shell: false, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Manual generation/check failed: ${script}`);
}

try {
  const source = join(staging, "source");
  for (const path of ["content", "assets", "scripts", "requirements.txt", "LICENSE.txt", "THIRD_PARTY_NOTICES.md", "README.md", "CONTRIBUTING.md", "SECURITY.md", "docs/DEPLOYMENT.md", "docs/extras/banner.png"]) await copySource(join(input, path), join(source, path));
  runPython(join(source, "scripts/build.py"), ["--offline"]);
  runPython(join(source, "scripts/check.py"));
  await rename(join(source, "dist"), join(staging, "site"));
  const manifest = {
    schema: 1,
    version,
    edition: "offline",
    sourceRepository: "https://github.com/Davoda1/EU5-Population-Editor-Manual",
    sha256: { source: await manualHashes(source), site: await manualHashes(join(staging, "site")) },
  };
  await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeFile(join(staging, "README.md"), `# Bundled manual ${version}\n\nThis frozen snapshot supplies the manual shipped with application ${version}.\n\n- \`source/\` contains the editable chapter, asset and generator source.\n- \`site/\` contains the matching generated offline edition. It is packaged as \`resources/manual/\`.\n- \`manifest.json\` records the exact SHA-256 inventory for both trees.\n\nNormal application builds verify the snapshot with \`node scripts/check-manual.mjs\`; they need no Python, local server or manual download.\n\nTo refresh it from the local manual repository, install its pinned build dependency, set \`EU5_MANUAL_PYTHON\` if necessary, and run \`node scripts/bundle-manual.mjs /path/to/manual\` from the application source root. To regenerate from this included source instead, pass \`docs/manual/source\`. The command validates the version, builds and checks a temporary copy, and replaces the snapshot only after verification succeeds. Do not edit generated pages or their hash inventory independently.\n\nThe hosted edition uses the same source with \`python scripts/build.py\`; the bundled edition uses \`--offline\`. Both have the same chapter text, illustrations and local search. Original documentation is AGPL-3.0-only; preserve the included third-party notices.\n`, "utf8");
  const result = await checkManual(staging, version);
  await mkdir(dirname(destination), { recursive: true });
  await cp(staging, pending, { recursive: true, errorOnExist: true, force: false });
  try { await rename(destination, backup); backedUp = true; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await rename(pending, destination);
  installed = true;
  if (backedUp) await rm(backup, { recursive: true });
  console.log(`Bundled manual ${version}: ${result.chapters} chapters, ${result.sourceFiles} editable source files and ${result.siteFiles} generated site files.`);
} finally {
  if (!installed && backedUp) await rename(backup, destination);
  await rm(pending, { recursive: true, force: true });
  await rm(staging, { recursive: true, force: true });
}
