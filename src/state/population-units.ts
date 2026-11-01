import { decimal, format } from "./comparison";

/** IPC, projects and EU5 files retain the game's thousand-person size units. */
export function gameToPeople(size: string): string {
  const { n, p } = decimal(size);
  return format(n * 1000n, p);
}

/** Group only the integer part; preserve every source decimal without rounding. */
export function formatPeople(size: string): string {
  const [whole, fraction] = gameToPeople(size).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Absolute editor input is an ungrouped whole-person count, never a float. */
export function peopleToGame(input: string, allowNegative = false): string {
  const value = input.trim();
  if (!/^-?\d+$/.test(value))
    throw new Error("Enter a whole number of people without separators or decimal places.");
  if (value.length > 131)
    throw new Error("Population is too large; no value changed.");
  const count = BigInt(value);
  if (!allowNegative && count < 0n)
    throw new Error("Population cannot be negative. Use Add / subtract to reduce it.");
  const source = format(count, 3);
  if (source.length > 128)
    throw new Error("Population is too large; no value changed.");
  return source;
}

export function hasFractionalPeople(size: string): boolean {
  return gameToPeople(size).includes(".");
}
