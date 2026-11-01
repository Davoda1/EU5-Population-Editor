// Explicit allowlist: game data, saved projects, dependencies and build state never enter the source archive.
import { createWriteStream } from "node:fs";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { TarArchive } from "archiver";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid release version");
const dirs = [
  "core/src",
  "core/tests",
  "electron",
  "src",
  "tests",
  "docs",
  "scripts",
  "third-party",
  "assets",
  ".github",
];
const files = [
  "package.json",
  "package-lock.json",
  "electron-builder.yml",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.mjs",
  "playwright.config.ts",
  "index.html",
  "README.md",
  "BUILDING.md",
  "CHANGELOG.md",
  "NOTICE.txt",
  "LICENSE.txt",
  "THIRD_PARTY_NOTICES.md",
  "TESTING-REPORT.md",
  ".gitignore",
  ".gitattributes",
  "core/Cargo.toml",
  "toolings/.gitkeep",
  "dependencies/.gitkeep",
  "build/.gitkeep",
  "release/.gitkeep",
];
for (const optional of ["CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md"]) {
  try { await readFile(optional); files.push(optional); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
await readFile("core/Cargo.lock");
files.push("core/Cargo.lock");
async function walk(path) {
  for (const entry of (await readdir(path, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    // Only the explicitly listed repository dotfiles above belong in source.
    // Exclude transient partial copies in live/synchronized working trees.
    if (entry.name.startsWith(".")) continue;
    const p = join(path, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symlink excluded from source: ${p}`);
    if (entry.isDirectory()) await walk(p);
    else files.push(p);
  }
}
for (const dir of dirs) await walk(dir);
for (const file of files) {
  if (
    /\.(?:7z|rgb|dat|crate|exe|deb|eu5popproj)$/i.test(file) ||
    (/\.png$/i.test(file) && !file.replaceAll("\\", "/").startsWith("docs/extras/") && !file.replaceAll("\\", "/").startsWith("assets/icons/") && !/^docs\/manual\/(?:source|site)\/assets\/[A-Za-z0-9-]+\.png$/.test(file.replaceAll("\\", "/")) && file.replaceAll("\\", "/") !== "docs/manual/source/docs/extras/banner.png") ||
    /(?:06_pops|10_countries|locations\.png)/i.test(file)
  )
    throw new Error(`Forbidden source artifact: ${file}`);
}
await mkdir("release", { recursive: true });
const output = createWriteStream(
  `release/EU5-Population-Editor-${version}-Source.tar.gz`,
);
const archive = new TarArchive({ gzip: true, gzipOptions: { level: 9 } });
const completion = new Promise((resolve, reject) => {
  output.on("close", resolve);
  archive.on("error", reject);
  output.on("error", reject);
});
archive.pipe(output);
for (const file of [...new Set(files)].sort()) {
  archive.append(await readFile(file), {
    name: `EU5-Population-Editor-${version}/${file.replaceAll("\\", "/")}`,
    date: new Date("2026-10-31T00:00:00Z"),
    mode: file.endsWith(".sh") ? 0o755 : 0o644,
  });
}
await archive.finalize();
await completion;
console.log(
  `Source archive created from ${files.length} allowlisted files. No application binary is implied.`,
);
