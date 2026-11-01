import type { ExternalDestination } from "../../src/types/api";

const destinations: Record<Exclude<ExternalDestination, "manual">, string> = Object.freeze({
  repository: "https://github.com/Davoda1/EU5-Population-Editor",
  issues: "https://github.com/Davoda1/EU5-Population-Editor/issues",
  "online-manual": "https://davoda1.github.io/EU5-Population-Editor-Manual/",
});

// The renderer selects a known destination; it never supplies a URL or scheme.
export function externalLink(destination: unknown): string {
  if (typeof destination !== "string" || !Object.hasOwn(destinations, destination))
    throw new Error("Unsupported link destination");
  return destinations[destination as Exclude<ExternalDestination, "manual">];
}
