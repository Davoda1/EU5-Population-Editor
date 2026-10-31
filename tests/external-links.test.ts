// @vitest-environment node
import { expect, it } from "vitest";
import { externalLink } from "../electron/main/external-links";

it("opens only the documented project destinations", () => {
  expect(externalLink("manual")).toBe("https://davoda1.github.io/EU5-Population-Editor-Manual/");
  expect(externalLink("repository")).toBe("https://github.com/Davoda1/EU5-Population-Editor");
  expect(externalLink("issues")).toBe("https://github.com/Davoda1/EU5-Population-Editor/issues");
});

it("rejects URLs, schemes, prototype properties and non-string inputs", () => {
  for (const value of ["https://example.org", "file:///tmp/file", "javascript:alert(1)", "__proto__", "constructor", "manual/../issues", null, {}, ["manual"]]) {
    expect(() => externalLink(value)).toThrow("Unsupported link destination");
  }
});
