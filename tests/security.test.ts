// Static boundary checks supplement (not replace) native Electron runtime tests.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
const compact = (s: string) => s.replace(/\s+/g, "").replace(/"/g, "\'");
const main = compact(readFileSync("electron/main/index.ts", "utf8")),
  preload = compact(readFileSync("electron/preload/index.ts", "utf8")),
  client = compact(readFileSync("electron/main/core-client.ts", "utf8")),
  html = readFileSync("index.html", "utf8");
it("isolates renderer with sandbox and disabled Node", () => {
  expect(main).toContain("contextIsolation:true");
  expect(main).toContain("nodeIntegration:false");
  expect(main).toContain("sandbox:true");
  expect(main).toContain("webSecurity:true");
});
it("launches sidecar directly without shell", () => {
  expect(client).toContain("spawn(this.executable,[],{shell:false");
  expect(client).not.toMatch(/exec\(|execSync/);
  expect(main).toContain("join(process.resourcesPath,'core'");
});
it("blocks remote content, new windows and navigation", () => {
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("script-src 'self'");
  expect(html).not.toContain("unsafe-eval");
  expect(main).toContain("action:'deny'");
  expect(main).toContain("on('will-navigate'");
  expect(main).toContain("callback({cancel:true})");
});
it("preload exposes only allowed methods and no raw IPC or file access", () => {
  expect(preload).toContain("methods.includes(method)");
  expect(preload).toContain("exposeInMainWorld('eu5',Object.freeze(api))");
  expect(preload).not.toMatch(
    /node:fs|node:child_process|sendSync|exposeInMainWorld\([^\n]*ipcRenderer/,
  );
});
it("privileged paths come from main-process dialogs", () => {
  expect(main).toContain("deleteparams.path;deleteparams.cache");
  expect(main).toContain("event.senderFrame!==window.webContents.mainFrame");
});
