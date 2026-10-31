import { spawnSync } from "node:child_process";
import { readFile, access, copyFile, mkdir, stat, lstat, readdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { verifyIcons, verifyWindowsIcon, iconSizes } from "./verify-icons.mjs";
function run(file, args) {
  const r = spawnSync(file, args, { encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${file}: ${r.stderr || r.error}`);
  return r.stdout;
}
async function rejectHiddenEntries(base) {
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) throw new Error(`Hidden/transient runtime entry: ${join(base, entry.name)}`);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected runtime symlink: ${join(base, entry.name)}`);
    if (entry.isDirectory()) await rejectHiddenEntries(join(base, entry.name));
  }
}
const platform = process.argv[2];
if (!["linux", "windows"].includes(platform)) throw new Error("Usage: node scripts/verify-release.mjs linux|windows [--structure-only]");
const structureOnly = process.argv.includes("--structure-only");
if (structureOnly && platform !== "windows") throw new Error("Structure-only verification is only for cross-built Windows packages");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const root = resolve(`build/packages/${platform === "windows" ? "win-unpacked" : "linux-unpacked"}`);
// The live unpacked tree may receive filesystem synchronization temporary files.
// Validate hidden-file exclusion on the actual archives below.
const exe = platform === "windows" ? "eu5-population-core.exe" : "eu5-population-core";
const sidecar = join(root, "resources/core", exe);
await access(sidecar);
if ((await stat(sidecar)).size < 10000) throw new Error("Sidecar is implausibly small");
await access(join(root, "resources/app.asar"));
await verifyIcons(join(root, "resources/assets"));
for (const file of ["icon.svg", "icon.ico", ...iconSizes.map(size => `icons/${size}.png`)]) {
  if (!(await readFile(join(root, "resources/assets", file))).equals(await readFile(join("assets", file))))
    throw new Error(`Packaged application icon differs from source: ${file}`);
}
await access(join(root, "LICENSES.chromium.html"));
const expectedMagic = platform === "windows" ? Buffer.from("MZ") : Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
if (!(await readFile(sidecar)).subarray(0, expectedMagic.length).equals(expectedMagic)) throw new Error("Sidecar has the wrong executable format");
if (!structureOnly) {
  // Test the actual packaged sidecar, not the development binary.
  const r = spawnSync(sidecar, [], { input: JSON.stringify({ id: 1, method: "status", params: {} }) + "\n", encoding: "utf8", shell: false });
  if (r.status !== 0) throw new Error(`Packaged Rust process failed: ${r.stderr || r.error}`);
  const response = JSON.parse(r.stdout.trim().split("\n")[0]);
  if (response.id !== 1 || !response.error) throw new Error("Unexpected packaged sidecar protocol response");
}
if (platform === "linux") {
  const deb = `release/eu5-population-editor_${version}_amd64.deb`;
  const metadata = run("dpkg-deb", ["-f", deb]);
  if (!metadata.includes("Architecture: amd64") || !metadata.includes(`Version: ${version}`)) throw new Error("Debian metadata mismatch");
  const contents = run("dpkg-deb", ["-c", deb]);
  if (!contents.split("\n").some(l => l.includes("chrome-sandbox") && l.startsWith("-rwsr-xr-x") && l.includes("root/root"))) throw new Error("Debian sandbox ownership/mode mismatch");
  const temp = await mkdtemp(join(tmpdir(), "eu5-package-verification-"));
  try {
    run("dpkg-deb", ["-x", deb, temp]);
    await rejectHiddenEntries(temp);
    const bin = join(temp, "usr/bin");
    const names = await readdir(bin);
    if (names.length !== 1 || names[0] !== "eu5-population-editor") throw new Error("Debian /usr/bin must contain exactly one entry");
    const entry = join(bin, names[0]);
    if (!(await lstat(entry)).isFile() || (await lstat(entry)).isSymbolicLink()) throw new Error("Debian entry point must be a regular binary");
    const bytes = await readFile(entry);
    if (!bytes.subarray(0, 4).equals(expectedMagic)) throw new Error("Debian entry point is not ELF");
    if (!bytes.includes(Buffer.from("/usr/lib/eu5-population-editor/eu5-population-editor"))) throw new Error("Debian entry point runtime path mismatch");
    const desktop = await readFile(join(temp, "usr/share/applications/eu5-population-editor.desktop"), "utf8");
    if (!desktop.includes("Exec=/usr/bin/eu5-population-editor\n")) throw new Error("Desktop entry does not use the installed native entry point");
    if (!desktop.includes("Icon=eu5-population-editor\n") || !desktop.includes("StartupWMClass=eu5-population-editor\n")) throw new Error("Desktop entry icon or window class mismatch");
    for (const size of iconSizes.filter(size => size <= 512)) {
      const installed = join(temp, `usr/share/icons/hicolor/${size}x${size}/apps/eu5-population-editor.png`);
      if (!(await readFile(installed)).equals(await readFile(`assets/icons/${size}.png`))) throw new Error(`Installed ${size}px icon mismatch`);
    }
    if (!(await readFile(join(temp, "usr/share/icons/hicolor/scalable/apps/eu5-population-editor.svg"))).equals(await readFile("assets/icon.svg"))) throw new Error("Installed scalable icon mismatch");
    const packagedCore = join(temp, "usr/lib/eu5-population-editor/resources/core/eu5-population-core");
    if (!(await readFile(packagedCore)).equals(await readFile(sidecar))) throw new Error("Debian and portable sidecars differ");
  } finally { await rm(temp, { recursive: true, force: true }); }
  const tarContents = run("tar", ["-tzf", `release/EU5-Population-Editor-${version}-Linux-x86_64.tar.gz`]).trim().split("\n");
  if (!tarContents.includes("eu5-population-editor") || !tarContents.includes("resources/app.asar")) throw new Error("Portable archive must have the real executable and resources at top level");
  if (tarContents.some(p => p.split("/").some(part => part.startsWith(".")))) throw new Error("Portable archive contains a hidden/transient file");
  if (tarContents.some(p => /\.(?:sh|bat|cmd|ps1)$/i.test(p))) throw new Error("Portable archive contains a launcher script");
} else {
  const files = await readdir(root);
  if (!files.some(f => f.toLowerCase().endsWith(".exe") && f !== "chrome_crashpad_handler.exe")) throw new Error("Windows root executable missing");
  const guiExecutables = files.filter(f => f.toLowerCase().endsWith(".exe") && f !== "chrome_crashpad_handler.exe");
  if (guiExecutables.length !== 1) throw new Error("Expected exactly one application EXE");
  await verifyWindowsIcon(join(root, guiExecutables[0]));
  if (files.some(f => /\.(?:bat|cmd|ps1)$/i.test(f))) throw new Error("Windows portable has launcher scripts");
  await mkdir("release", { recursive: true });
  const name = `EU5-Population-Editor-${version}-Windows-x86_64-Portable.zip`;
  try { await access(join("release", name)); }
  catch { await copyFile(join("build/packages", name), join("release", name)); }
}
console.log(structureOnly ? "Windows package structure PASS; native Windows runtime test NOT performed" : "Package layout, actual packaged sidecar protocol and platform metadata verification PASS");
