import { spawnSync } from "node:child_process";
import { mkdir, cp, copyFile, writeFile, chmod, rm, access, readdir, readFile, open, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

function run(file, args, options = {}) {
  const r = spawnSync(file, args, { stdio: "inherit", shell: false, ...options });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${file} failed: ${r.status}`);
  return r.stdout;
}
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid release version");
if (process.platform !== "linux" || process.arch !== "x64") throw new Error("Linux packaging requires an x86-64 Linux build host");
process.umask(0o022);
const unpacked = resolve("build/packages/linux-unpacked");
await access("build/sidecar/eu5-population-core");
await access("core/Cargo.lock");
run(process.execPath, ["node_modules/electron-builder/cli.js", "--linux", "--dir", "--x64", "--publish", "never"]);

// Interrupted copies can leave large temporary Electron executables behind.
// They are not runtime assets. Remove only this known temporary-file form;
// Input collection excludes all hidden components; actual archives are verified.
for (const entry of await readdir(unpacked, { withFileTypes: true })) {
  if (/^\.electron\.[A-Za-z0-9.]+$/.test(entry.name) && entry.isFile()) {
    await rm(join(unpacked, entry.name), { force: true });
  }
}

// Select regular runtime files explicitly. Filesystem synchronization can leave
// hidden partial copies behind; none are application assets or package inputs.
async function collect(base, relative = "") {
  const files = [];
  for (const e of (await readdir(join(base, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(relative, e.name);
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) files.push(...await collect(base, path));
    else if (e.isFile()) files.push(path);
    else throw new Error(`Unsupported package entry: ${path}`);
  }
  return files;
}
const inputFiles = await collect(unpacked);
// Package from a private temporary tree so live workspace synchronization cannot
// introduce partial-copy files after input selection.
const temporary = await mkdtemp(join(tmpdir(), "eu5-linux-package-"));
try {
const portable = join(temporary, "portable");
for (const path of inputFiles) {
  await mkdir(join(portable, path, ".."), { recursive: true });
  await copyFile(join(unpacked, path), join(portable, path));
}
const stage = join(temporary, "debian");
await mkdir(join(stage, "DEBIAN"), { recursive: true });
const runtime = join(stage, "usr/lib/eu5-population-editor");
await cp(portable, runtime, { recursive: true });
await mkdir(join(stage, "usr/bin"), { recursive: true });
run(process.env.CC || "cc", ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-fPIE", "-pie", "-Wl,-z,relro,-z,now", "-s", "scripts/linux-entry.c", "-o", join(stage, "usr/bin/eu5-population-editor")]);
await chmod(join(stage, "usr/bin/eu5-population-editor"), 0o755);
await chmod(join(runtime, "chrome-sandbox"), 0o4755);

// Derive the actual minimum glibc version from linked symbol requirements.
// An inaccurate lower bound would allow apt to install an unusable build.
let glibc = "2.34";
const compareVersion = (a, b) => {
  const aa = a.split(".").map(Number), bb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) - (bb[i] || 0);
  }
  return 0;
};
for (const file of await collect(stage)) {
  const path = join(stage, file), bytes = Buffer.alloc(4);
  const handle = await open(path, "r");
  try { await handle.read(bytes, 0, 4, 0); } finally { await handle.close(); }
  if (!bytes.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) continue;
  const output = run("readelf", ["--version-info", "--wide", path], { stdio: "pipe", encoding: "utf8" });
  for (const m of output.matchAll(/\bGLIBC_(\d+(?:\.\d+)+)\b/g)) if (compareVersion(m[1], glibc) > 0) glibc = m[1];
}
await writeFile(join(stage, "DEBIAN/control"), `Package: eu5-population-editor\nVersion: ${version}\nSection: games\nPriority: optional\nArchitecture: amd64\nMaintainer: davoda1 <davoda1@users.noreply.github.com>\nHomepage: https://github.com/Davoda1/EU5-Population-Editor\nDepends: libc6 (>= ${glibc}), libstdc++6, libgtk-3-0, libnss3, libasound2 | libasound2t64, libgbm1, libxss1, libxtst6, libx11-xcb1, libdrm2, libxkbcommon0, libxrandr2\nDescription: Unofficial offline EU5 population and demographics editor\n Source-preserving population editing with explicit Draft and Apply.\n Not affiliated with or endorsed by Paradox Interactive.\n`);
await mkdir(join(stage, "usr/share/applications"), { recursive: true });
await writeFile(join(stage, "usr/share/applications/eu5-population-editor.desktop"), "[Desktop Entry]\nName=EU5 Population & Demographics Editor\nComment=Unofficial offline population editor\nExec=/usr/bin/eu5-population-editor\nIcon=eu5-population-editor\nStartupWMClass=eu5-population-editor\nTerminal=false\nType=Application\nCategories=Game;Utility;\n");
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  const iconDir = join(stage, `usr/share/icons/hicolor/${size}x${size}/apps`);
  await mkdir(iconDir, { recursive: true });
  await copyFile(`assets/icons/${size}.png`, join(iconDir, "eu5-population-editor.png"));
}
const scalableDir = join(stage, "usr/share/icons/hicolor/scalable/apps");
await mkdir(scalableDir, { recursive: true });
await copyFile("assets/icon.svg", join(scalableDir, "eu5-population-editor.svg"));
await writeFile(join(portable, "RUNNING.txt"), `EU5 Population & Demographics Editor ${version}\n\nExtract this entire archive into an empty directory. Run ./eu5-population-editor as an ordinary desktop user. The executable is at the archive root; keep the accompanying files and resources together. No Python, Node or Rust installation is needed.\n\nRequires x86-64 GNU/Linux with glibc ${glibc} or newer (not musl), GTK 3, NSS, ALSA, GBM, X11/XCB, libdrm, libxkbcommon and standard C++ runtime libraries. Distribution package names vary.\n\nElectron requires usable unprivileged user namespaces or its root-owned setuid sandbox. If your distribution disables user namespaces, install the extracted directory in a root-owned location that ordinary users cannot modify, then have the administrator set chrome-sandbox ownership to root:root and permissions to 4755. The enclosing filesystem must permit setuid executables. Run the editor as your ordinary user afterwards. Never disable the sandbox.\n\nPreferences and map caches are stored in the normal per-user configuration directory. Game installations are read-only; save projects and export mods to separate locations.\n`);
await copyFile(join(portable, "RUNNING.txt"), join(runtime, "RUNNING.txt"));
await mkdir("release", { recursive: true });
run("dpkg-deb", ["--root-owner-group", "-Zxz", "-z6", "--build", stage, `release/eu5-population-editor_${version}_amd64.deb`]);
const entries = await collect(portable);
const fileList = join(temporary, "package-files.txt");
await writeFile(fileList, entries.join("\0") + "\0");
// No enclosing directory: the actual Electron executable is at archive root.
run("tar", ["-czf", `release/EU5-Population-Editor-${version}-Linux-x86_64.tar.gz`, "-C", portable, "--null", "--verbatim-files-from", "--no-recursion", "-T", fileList]);
console.log(`Linux packages created; minimum glibc ${glibc}. Debian /usr/bin contains one native executable, with no launcher scripts or links.`);

} finally { await rm(temporary, { recursive: true, force: true }); }
