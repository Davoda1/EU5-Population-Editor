import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, readdir, access } from "node:fs/promises";
const exists = async (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );
/** Read Valve's quoted key/value path entries; no shell or registry mutation. */
export async function candidates(): Promise<string[]> {
  const roots =
    process.platform === "win32"
      ? [
          join(
            process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
            "Steam",
          ),
          join(process.env.PROGRAMFILES || "C:\\Program Files", "Steam"),
        ]
      : [
          join(homedir(), ".steam/steam"),
          join(homedir(), ".local/share/Steam"),
          join(homedir(), ".var/app/com.valvesoftware.Steam/data/Steam"),
        ];
  const libraries = new Set(roots);
  for (const root of roots) {
    try {
      const text = await readFile(
        join(root, "steamapps/libraryfolders.vdf"),
        "utf8",
      );
      for (const m of text.matchAll(/"path"\s*"((?:\\.|[^"\\])*)"/g))
        libraries.add(m[1].replace(/\\\\/g, "\\").replace(/\\"/g, '"'));
    } catch {
      /* optional Steam location */
    }
  }
  const found: string[] = [];
  for (const root of libraries) {
    const common = join(root, "steamapps/common");
    try {
      for (const entry of await readdir(common, { withFileTypes: true })) {
        if (
          entry.isDirectory() &&
          /europa.*universalis.*(?:v|5)$/i.test(entry.name)
        ) {
          const p = join(common, entry.name);
          if (
            (await exists(join(p, "game"))) ||
            (await exists(join(p, "main_menu")))
          )
            found.push(p);
        }
      }
    } catch {
      /* manual Browse always available */
    }
  }
  return found;
}
