import { build } from "esbuild";
for (const [entry, out] of [
  ["electron/main/index.ts", "main"],
  ["electron/preload/index.ts", "preload"],
])
  await build({
    entryPoints: [entry],
    outfile: `build/electron/${out}.cjs`,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: false,
  });
