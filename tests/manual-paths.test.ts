// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { MANUAL_HOME, manualExternal, manualResource } from "../electron/main/manual-paths";

describe("offline manual resource boundary", () => {
  const root = resolve("manual fixture Ω");
  it("resolves local chapters, assets, query versions and anchors", () => {
    expect(manualResource(root, MANUAL_HOME)).toBe(resolve(root, "index.html"));
    expect(manualResource(root, "eu5-manual://manual/assets/manual.css?v=1.0.3")).toBe(resolve(root, "assets/manual.css"));
    expect(manualResource(root, "eu5-manual://manual/editing.html#draft-and-apply")).toBe(resolve(root, "editing.html"));
  });
  it("rejects foreign schemes, authorities and encoded traversal", () => {
    for (const url of ["https://example.org", "file:///etc/passwd", "eu5-manual://other/index.html", "eu5-manual://user@manual/index.html", "eu5-manual://manual:9100/index.html", "eu5-manual://manual/assets/%2e%2e%2f%2e%2e%2fsecret.txt", "eu5-manual://manual/%5csecret", "eu5-manual://manual/.private", "eu5-manual://manual/C%3A/secret", "eu5-manual://manual/%00", "eu5-manual://manual/%GG"])
      expect(manualResource(root, url), url).toBeNull();
  });
  it("opens only the documented project web destinations", () => {
    expect(manualExternal("https://github.com/Davoda1/EU5-Population-Editor/releases")).toBe(true);
    expect(manualExternal("https://github.com/Davoda1/EU5-Population-Editor-Manual/issues")).toBe(true);
    expect(manualExternal("https://davoda1.github.io/EU5-Population-Editor-Manual/")).toBe(true);
    for (const url of ["http://github.com/Davoda1/EU5-Population-Editor", "https://github.com.evil.example/Davoda1/EU5-Population-Editor", "https://github.com/Davoda1/EU5-Population-Editor-Other", "https://user@github.com/Davoda1/EU5-Population-Editor", "https://github.com:9100/Davoda1/EU5-Population-Editor", "file:///etc/passwd", "javascript:alert(1)"])
      expect(manualExternal(url), url).toBe(false);
  });
});
