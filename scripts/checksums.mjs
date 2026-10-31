import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = (await readdir("release"))
  .filter((n) => /\.(zip|gz|deb|txt)$/.test(n) && n !== "SHA256SUMS")
  .sort();
const lines = [];
for (const file of files) {
  const hash = createHash("sha256")
    .update(await readFile(`release/${file}`))
    .digest("hex");
  const line = `${hash}  ${file}\n`;
  lines.push(line);
  console.log(line.trim());
}
await writeFile("release/SHA256SUMS", lines.join(""));
