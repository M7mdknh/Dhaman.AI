/**
 * Numeric token handling for financial statements. All arithmetic is done
 * on decimal STRINGS (sign + digit shifting) — no floats, ever.
 */

/** Matches printed amounts: 1,234,567 · (1,234) · 1234.56 · -42 */
export const AMOUNT_RE = /\(?-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\)?/g;

/**
 * Parses one printed amount into a plain decimal string.
 * "(1,234.5)" → "-1234.5". Returns null for tokens that are not amounts.
 */
export function parseAmount(token: string): string | null {
  const trimmed = token.trim();
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
  const digits = trimmed.replace(/[(),\s-]/g, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  const stripped = digits.replace(/^0+(?=\d)/, "");
  if (/^0?(\.0*)?$/.test(stripped)) return "0";
  return negative ? `-${stripped}` : stripped;
}

/**
 * Multiplies a decimal string by a power-of-ten scale by shifting the
 * decimal point ("1234.5" × 1000 → "1234500").
 */
export function scaleDecimalString(value: string, scale: number): string {
  if (scale === 1) return value;
  const shift = Math.round(Math.log10(scale));
  const negative = value.startsWith("-");
  const [intPart, fracPart = ""] = (negative ? value.slice(1) : value).split(".");
  const digits = intPart + fracPart.padEnd(shift, "0");
  const pointAt = intPart.length + shift;
  const head = digits.slice(0, pointAt).replace(/^0+(?=\d)/, "") || "0";
  const tail = digits.slice(pointAt).replace(/0+$/, "");
  const result = tail ? `${head}.${tail}` : head;
  return negative && result !== "0" ? `-${result}` : result;
}

/** Compares two decimal strings (may be negative): -1 | 0 | 1. */
export function compareAmounts(a: string, b: string): number {
  const negA = a.startsWith("-");
  const negB = b.startsWith("-");
  if (negA !== negB) return negA ? -1 : 1;
  const cmp = compareMagnitude(negA ? a.slice(1) : a, negB ? b.slice(1) : b);
  return negA ? -cmp : cmp;
}

function compareMagnitude(a: string, b: string): number {
  const [aInt = "0", aFrac = ""] = a.split(".");
  const [bInt = "0", bFrac = ""] = b.split(".");
  const width = Math.max(aInt.length, bInt.length);
  const fracWidth = Math.max(aFrac.length, bFrac.length);
  const na = aInt.padStart(width, "0") + aFrac.padEnd(fracWidth, "0");
  const nb = bInt.padStart(width, "0") + bFrac.padEnd(fracWidth, "0");
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/** Sums decimal strings exactly (used only for validation checks). */
export function addAmounts(values: string[]): string {
  let total = 0n;
  let maxFrac = 0;
  for (const v of values) maxFrac = Math.max(maxFrac, (v.split(".")[1] ?? "").length);
  for (const v of values) {
    const negative = v.startsWith("-");
    const [intPart, fracPart = ""] = (negative ? v.slice(1) : v).split(".");
    const cents = BigInt(intPart + fracPart.padEnd(maxFrac, "0"));
    total += negative ? -cents : cents;
  }
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(maxFrac + 1, "0");
  const intPart = digits.slice(0, digits.length - maxFrac) || "0";
  const fracPart = maxFrac ? digits.slice(digits.length - maxFrac).replace(/0+$/, "") : "";
  const result = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative && result !== "0" ? `-${result}` : result;
}
