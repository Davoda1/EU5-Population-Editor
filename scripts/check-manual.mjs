// Verify the frozen documentation without Python, a server, or network access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function manualFiles(root, prefix = "") {
  const files = [];
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), `Manual snapshot contains a symlink: ${name}`);
    assert.ok(!entry.name.startsWith(".") && entry.name !== "__pycache__", `Unexpected hidden/generated manual file: ${name}`);
    if (entry.isDirectory()) files.push(...await manualFiles(root, name));
    else {
      assert.ok(entry.isFile(), `Unsupported manual entry: ${name}`);
      files.push(name);
    }
  }
  return files;
}

export async function manualHashes(root) {
  const hashes = {};
  for (const name of await manualFiles(root)) hashes[name] = createHash("sha256").update(await readFile(join(root, name))).digest("hex");
  return hashes;
}

function localTarget(site, page, href) {
  assert.ok(!href.startsWith("/") && !href.includes("\\"), `Nonportable manual link: ${href}`);
  const url = new URL(href, `https://manual.invalid/${page}`);
  assert.equal(url.origin, "https://manual.invalid", `Unexpected local manual origin: ${href}`);
  const decoded = decodeURIComponent(url.pathname).replace(/^\//, "");
  const target = resolve(site, decoded);
  const path = relative(site, target);
  assert.ok(path && !path.startsWith(`..${sep}`) && path !== "..", `Manual link escapes its directory: ${href}`);
  return { path: path.split(sep).join("/"), fragment: decodeURIComponent(url.hash.slice(1)) };
}

export async function checkManual(bundle = join(projectRoot, "docs/manual"), version) {
  version ??= JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")).version;
  const manifest = JSON.parse(await readFile(join(bundle, "manifest.json"), "utf8"));
  assert.equal(manifest.schema, 1, "Unsupported manual manifest schema");
  assert.equal(manifest.version, version, "Bundled manual does not match the application version");
  assert.equal(manifest.edition, "offline", "Application must bundle the offline manual edition");
  for (const area of ["source", "site"]) {
    const expected = manifest.sha256?.[area];
    assert.ok(expected && typeof expected === "object" && !Array.isArray(expected), `Missing ${area} hash inventory`);
    for (const [name, hash] of Object.entries(expected)) {
      assert.ok(!name.split("/").some(part => !part || part === "." || part === "..") && !name.includes("\\"), `Invalid manual inventory path: ${name}`);
      assert.match(hash, /^[a-f0-9]{64}$/, `Invalid manual hash: ${name}`);
    }
    assert.deepEqual(await manualHashes(join(bundle, area)), expected, `Bundled manual ${area} differs from its frozen inventory; regenerate the snapshot explicitly`);
  }
  const source = join(bundle, "source"), site = join(bundle, "site");
  const buildSource = await readFile(join(source, "scripts/build.py"), "utf8");
  assert.equal(buildSource.match(/^VERSION = '([^']+)'/m)?.[1], version, "Manual source version mismatch");
  assert.equal((await readFile(join(source, "requirements.txt"), "utf8")).trim(), "Markdown==3.8.1", "Unexpected manual build dependency");
  const metadata = JSON.parse(await readFile(join(site, "manual.json"), "utf8"));
  assert.equal(metadata.version, version);
  assert.equal(metadata.edition, "offline");
  assert.equal(metadata.pages.length, 15);
  assert.equal(new Set(metadata.pages).size, metadata.pages.length);
  const inventory = new Set(Object.keys(manifest.sha256.site));
  const chapters = new Map();
  for (const page of metadata.pages) {
    assert.match(page, /^(?:index|[a-z]+(?:-[a-z]+)*)\.html$/);
    const html = await readFile(join(site, page), "utf8");
    assert.ok(html.includes(`data-version="${version}"`) && html.includes('data-edition="offline"'), `Wrong manual edition in ${page}`);
    assert.ok(html.includes(`<meta name="eu5-manual-version" content="${version}">`), `Missing runtime manual edition marker in ${page}`);
    assert.ok(!html.includes("/blob/master/"), `Moving source link in bundled manual: ${page}`);
    assert.ok(html.includes("Content-Security-Policy") && html.includes("connect-src 'none'"), `Missing offline policy in ${page}`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `Duplicate anchors in ${page}`);
    chapters.set(page, { html, ids: new Set(ids) });
  }
  for (const [page, { html }] of chapters) {
    for (const tag of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*>/gi)) {
      const name = tag[1].toLowerCase();
      for (const attribute of tag[0].matchAll(/\b(href|src)="([^"]*)"/g)) {
        const [, key, href] = attribute;
        const external = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
        if (external) {
          assert.ok(key === "href" && name === "a" && href.startsWith("https://"), `External resource or unsafe link in ${page}: ${href}`);
          continue;
        }
        const target = localTarget(site, page, href);
        assert.ok(inventory.has(target.path), `Missing manual link from ${page}: ${href}`);
        if (target.fragment && chapters.has(target.path)) assert.ok(chapters.get(target.path).ids.has(target.fragment), `Missing manual anchor from ${page}: ${href}`);
      }
    }
  }
  const searchSource = await readFile(join(site, "assets/search-index.js"), "utf8");
  assert.ok(searchSource.startsWith("window.MANUAL_SEARCH = "));
  const search = JSON.parse(searchSource.slice("window.MANUAL_SEARCH = ".length).trim().replace(/;$/, ""));
  assert.deepEqual(search.map(entry => entry.url).sort(), [...metadata.pages].sort(), "Search index differs from chapter inventory");
  for (const entry of search) {
    assert.ok(entry.title && entry.text);
    for (const heading of entry.headings) {
      const target = localTarget(site, entry.url, heading.url);
      assert.ok(chapters.has(target.path) && chapters.get(target.path).ids.has(target.fragment), `Invalid search heading: ${heading.url}`);
    }
  }
  for (const file of ["LICENSE.txt", "THIRD_PARTY_NOTICES.md"]) assert.equal(await readFile(join(site, file), "utf8"), await readFile(join(source, file), "utf8"), `Manual notice differs from source: ${file}`);
  return { version, chapters: metadata.pages.length, sourceFiles: Object.keys(manifest.sha256.source).length, siteFiles: inventory.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkManual();
  console.log(`Bundled offline manual ${result.version} verified: ${result.chapters} chapters, ${result.sourceFiles} source files, ${result.siteFiles} site files; hashes, local links and search valid.`);
}
