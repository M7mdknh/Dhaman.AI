/**
 * Thousands-separator plumbing for money inputs. Pure and display-only:
 *
 *   what the user sees   "6,000,000"
 *   what the form holds  "6000000"
 *
 * The stored value NEVER carries separators — validation
 * (`/^\d{1,16}(\.\d{1,2})?$/`) and Prisma.Decimal both take the raw decimal
 * string exactly as before, so grouping cannot change what the bank records.
 *
 * Separators shift characters around as the user types, which is what makes a
 * naive implementation bounce the cursor to the end after every keystroke. The
 * fix is to measure the caret in SIGNIFICANT characters (digits and the decimal
 * point) rather than raw offsets: those survive regrouping, commas do not.
 */

/** Digits and the decimal point — the only characters the caret can anchor to. */
const SIGNIFICANT = /[\d.]/;

/**
 * Keeps digits and at most one decimal point; everything else is dropped.
 * Deliberately does NOT truncate extra decimals or strip leading zeros: both
 * would fight the user mid-typing, and the decimal-places rule is validation's
 * job, not the keyboard's.
 */
export function sanitizeMoneyInput(text: string): string {
  let out = "";
  let seenDot = false;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !seenDot) {
      out += ch;
      seenDot = true;
    }
  }
  return out;
}

/** "6000000.5" → "6,000,000.5". Groups the integer part only. */
export function groupDigits(raw: string): string {
  if (raw === "") return "";
  const [intPart, ...rest] = raw.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // A trailing "." is preserved so "6000000." keeps rendering while typing.
  return rest.length > 0 ? `${grouped}.${rest.join("")}` : grouped;
}

/** How many digits/decimal points appear in `text` (ignores separators). */
export function countSignificant(text: string): number {
  let n = 0;
  for (const ch of text) if (SIGNIFICANT.test(ch)) n++;
  return n;
}

/**
 * The offset in `display` that sits just after its `count`-th significant
 * character — the caret position that keeps the user on the same digit after
 * the string has been regrouped.
 */
export function caretAfterSignificant(display: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < display.length; i++) {
    if (SIGNIFICANT.test(display[i])) {
      seen++;
      if (seen === count) return i + 1;
    }
  }
  return display.length;
}
