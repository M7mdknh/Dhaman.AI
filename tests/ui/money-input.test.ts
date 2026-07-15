/**
 * Money input plumbing: what the user sees vs what the form holds, and the
 * caret arithmetic that stops the cursor jumping while separators appear.
 */
import { describe, expect, it } from "vitest";

import {
  formatMoney,
  formatMoneyWhole,
  formatPercent,
  formatPercentValue,
  formatRatio,
} from "@/lib/format";
import {
  caretAfterSignificant,
  countSignificant,
  groupDigits,
  sanitizeMoneyInput,
} from "@/lib/money-input";

describe("grouping", () => {
  it("groups thousands", () => {
    expect(groupDigits("6000000")).toBe("6,000,000");
    expect(groupDigits("1000000000")).toBe("1,000,000,000");
    expect(groupDigits("100")).toBe("100");
    expect(groupDigits("1000")).toBe("1,000");
  });

  it("groups only the integer part", () => {
    expect(groupDigits("6000000.5")).toBe("6,000,000.5");
    expect(groupDigits("1234567.89")).toBe("1,234,567.89");
  });

  /** Mid-typing states must survive: "6000000." is a real keystroke. */
  it("preserves a trailing decimal point", () => {
    expect(groupDigits("6000000.")).toBe("6,000,000.");
    expect(groupDigits("")).toBe("");
  });
});

describe("sanitizing", () => {
  it("keeps digits and one decimal point", () => {
    expect(sanitizeMoneyInput("6,000,000")).toBe("6000000");
    expect(sanitizeMoneyInput("6,000,000.50")).toBe("6000000.50");
    expect(sanitizeMoneyInput("SAR 6,000,000")).toBe("6000000");
    expect(sanitizeMoneyInput("1.2.3")).toBe("1.23");
    expect(sanitizeMoneyInput("abc")).toBe("");
  });

  /**
   * The decimal-places rule belongs to zod, not the keyboard: truncating here
   * would silently swallow "1.234" instead of showing the validation message.
   */
  it("does not truncate extra decimals or strip leading zeros", () => {
    expect(sanitizeMoneyInput("1.234")).toBe("1.234");
    expect(sanitizeMoneyInput("0.5")).toBe("0.5");
  });
});

describe("caret preservation", () => {
  it("counts digits and points, ignoring separators", () => {
    expect(countSignificant("6,000,00")).toBe(6); // six digits, two commas
    expect(countSignificant("1,234.5")).toBe(6); // five digits + the point
    expect(countSignificant("")).toBe(0);
  });

  /**
   * Typing "6000000" one digit at a time: after the 7th digit the display is
   * "6,000,000" and the caret must sit at the very end, not where the raw
   * offset would have left it.
   */
  it("lands after the same digit once separators shift the string", () => {
    expect(caretAfterSignificant("6,000,000", 7)).toBe(9);
    expect(caretAfterSignificant("6,000,000", 1)).toBe(1);
    // 4 digits typed ⇒ "1,234": caret after the "4".
    expect(caretAfterSignificant("1,234", 4)).toBe(5);
  });

  /** Editing mid-number: caret stays on the digit boundary the user chose. */
  it("keeps the caret mid-string when a separator is inserted before it", () => {
    // User had "100000" caret at end (6 digits) and types "0" → raw 1000000.
    const display = groupDigits("1000000"); // "1,000,000"
    expect(caretAfterSignificant(display, 7)).toBe(9);
    // Caret after the 4th digit of "1,000,000" is index 5 ("1,000|,000").
    expect(display.slice(0, caretAfterSignificant(display, 4))).toBe("1,000");
  });

  it("clamps at the ends", () => {
    expect(caretAfterSignificant("1,234", 0)).toBe(0);
    expect(caretAfterSignificant("1,234", 99)).toBe(5);
  });
});

describe("round trip", () => {
  /** The form's stored value must never carry separators — zod rejects them. */
  it("stores raw digits for what the user sees grouped", () => {
    const typed = "6,000,000";
    const raw = sanitizeMoneyInput(typed);
    expect(raw).toBe("6000000");
    expect(/^\d{1,16}(\.\d{1,2})?$/.test(raw)).toBe(true); // the zod money rule
    expect(groupDigits(raw)).toBe(typed);
  });
});

describe("display formatters", () => {
  /**
   * Intl joins the currency code to the amount with a NON-BREAKING space
   * (U+00A0) — deliberate typography: "SAR" must never wrap onto a line
   * without its number. Asserted explicitly so a future change to a plain
   * space is caught rather than silently shipped.
   */
  const NB = " ";

  it("never renders a bare 6000000", () => {
    expect(formatMoney("6000000")).toBe(`SAR${NB}6,000,000.00`);
    expect(formatMoneyWhole("6000000")).toBe(`SAR${NB}6,000,000`);
    expect(formatMoneyWhole("1000000000")).toBe(`SAR${NB}1,000,000,000`);
  });

  /** Accounting convention: negatives in parentheses, never a minus sign. */
  it("renders negatives in accounting parentheses", () => {
    expect(formatMoneyWhole("-8000000")).toBe(`(SAR${NB}8,000,000)`);
    expect(formatMoney("-8000000")).toBe(`(SAR${NB}8,000,000.00)`);
    expect(formatMoneyWhole("-8000000")).not.toContain("-");
  });

  it("honours the statement's currency", () => {
    expect(formatMoneyWhole("6000000", "USD")).toBe(`USD${NB}6,000,000`);
  });

  it("fixes ratios at 2 dp and percentages at 1 dp", () => {
    expect(formatRatio(2.333333)).toBe("2.33");
    expect(formatRatio(null)).toBe("—");
    expect(formatPercent(0.1)).toBe("10.0%");
    expect(formatPercent(null)).toBe("—");
  });

  /**
   * A stored percentage is already a percentage. Routing it through
   * formatPercent would report 10% as "1000.0%" — the two helpers exist
   * precisely so that mistake cannot be made silently.
   */
  it("renders an entered percentage without rescaling it", () => {
    expect(formatPercentValue("10")).toBe("10%");
    expect(formatPercentValue("10.00")).toBe("10%");
    expect(formatPercentValue("12.5")).toBe("12.5%");
    expect(formatPercentValue(null)).toBeNull();
    expect(formatPercentValue("")).toBeNull();
    expect(formatPercent(0.1)).not.toBe(formatPercentValue("0.1"));
  });
});
