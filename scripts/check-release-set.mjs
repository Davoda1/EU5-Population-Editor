import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
const {version} = JSON.parse(await readFile('package.json', 'utf8'));
const expected = [
  `EU5-Population-Editor-${version}-Windows-x86_64-Portable.zip`,
  `EU5-Population-Editor-${version}-Linux-x86_64.tar.gz`,
  `eu5-population-editor_${version}_amd64.deb`,
  `EU5-Population-Editor-${version}-Source.tar.gz`,
].sort();
const actual = (await readdir('release')).filter(n => n !== 'SHA256SUMS' && n !== '.gitkeep').sort();
assert.deepEqual(actual, expected, 'Release must contain exactly the four matching-version archives');
for (const file of expected) assert.ok((await stat(`release/${file}`)).size > 1000, `Empty/truncated asset: ${file}`);
console.log(`Complete ${version} release set verified.`);
