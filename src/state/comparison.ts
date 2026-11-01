import type { Location, Row } from "../types/api";
// Display arithmetic is exact too. All edits themselves are calculated by Rust.
export function decimal(s: string): { n: bigint; p: number } {
  const neg = s.startsWith("-");
  const [a, b = ""] = s.replace(/^-/, "").split(".");
  return { n: BigInt(a + b) * (neg ? -1n : 1n), p: b.length };
}
export function format(n: bigint, p: number): string {
  const sign = n < 0n ? "-" : "";
  let s = (n < 0n ? -n : n).toString().padStart(p + 1, "0");
  if (p) s = s.slice(0, -p) + "." + s.slice(-p);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return s === "0" ? "0" : sign + s;
}
export function difference(a: string, b: string) {
  const x = decimal(a),
    y = decimal(b),
    p = Math.max(x.p, y.p);
  return format(x.n * 10n ** BigInt(p - x.p) - y.n * 10n ** BigInt(p - y.p), p);
}
export function add(a: string, b: string) {
  return difference(a, format(-decimal(b).n, decimal(b).p));
}
export function percent(value: string, total: string) {
  const a = decimal(value),
    b = decimal(total);
  if (b.n === 0n) return "—";
  const numerator = a.n * 10n ** BigInt(b.p) * 10000n;
  const denominator = b.n * 10n ** BigInt(a.p);
  return format(numerator / denominator, 2) + "%";
}
export function comparison(location: Location) {
  const keys = new Set([
    ...Object.keys(location.original),
    ...Object.keys(location.working),
    ...Object.keys(location.draft || {}),
  ]);
  return [...keys].sort().map((key) => {
    const o = location.original[key],
      w = location.working[key],
      d = location.draft?.[key];
    return {
      key,
      row: (d || w || o) as Row,
      original: o?.size || "0",
      working: w?.size || "0",
      draft: location.draft ? d?.size || "0" : null,
      delta: difference(
        d?.size ?? (location.draft ? "0" : w?.size || "0"),
        o?.size || "0",
      ),
    };
  });
}
export function summary(
  rows: Record<string, Row>,
  axis: "culture" | "religion" | "type",
) {
  // Definition IDs can legally be names such as "constructor" or "__proto__".
  const out: Record<string, string> = Object.create(null);
  for (const row of Object.values(rows))
    out[row[axis]] = add(out[row[axis]] || "0", row.size);
  return out;
}
