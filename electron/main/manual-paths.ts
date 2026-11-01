import { isAbsolute, relative, resolve } from "node:path";

export const MANUAL_SCHEME = "eu5-manual";
export const MANUAL_HOME = `${MANUAL_SCHEME}://manual/index.html`;

// An internal URL is a resource capability limited to the packaged manual.
export function manualResource(root: string, address: string): string | null {
  try {
    const url = new URL(address);
    if (url.protocol !== `${MANUAL_SCHEME}:` || url.hostname !== "manual" ||
        url.username || url.password || url.port) return null;
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.includes("\\") || decoded.includes("\0") || decoded.includes(":")) return null;
    const parts = decoded.split("/").filter(Boolean);
    if (parts.some((part) => part === "." || part === ".." || part.startsWith("."))) return null;
    const target = resolve(root, ...parts.length ? parts : ["index.html"]);
    const rel = relative(resolve(root), target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
    return target;
  } catch { return null; }
}

export function manualExternal(address: string): boolean {
  try {
    const url = new URL(address);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (url.origin === "https://davoda1.github.io")
      return url.pathname === "/EU5-Population-Editor-Manual" || url.pathname.startsWith("/EU5-Population-Editor-Manual/");
    if (url.origin !== "https://github.com") return false;
    return ["/Davoda1/EU5-Population-Editor", "/Davoda1/EU5-Population-Editor-Manual"]
      .some((path) => url.pathname === path || url.pathname.startsWith(path + "/"));
  } catch { return false; }
}
