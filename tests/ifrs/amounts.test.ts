import { describe, expect, it } from "vitest";

import { addAmounts, compareAmounts, parseAmount, scaleDecimalString } from "@/lib/ifrs/amounts";

describe("parseAmount", () => {
  it("parses plain and comma-grouped amounts", () => {
    expect(parseAmount("1,234,567")).toBe("1234567");
    expect(parseAmount("42")).toBe("42");
    expect(parseAmount("1234.56")).toBe("1234.56");
  });

  it("treats parentheses and minus as negative", () => {
    expect(parseAmount("(1,234.5)")).toBe("-1234.5");
    expect(parseAmount("-42")).toBe("-42");
  });

  it("normalizes zero and strips leading zeros", () => {
    expect(parseAmount("0")).toBe("0");
    expect(parseAmount("(0)")).toBe("0");
    expect(parseAmount("007")).toBe("7");
  });

  it("rejects non-amounts", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("scaleDecimalString", () => {
  it("shifts by thousands and millions", () => {
    expect(scaleDecimalString("1234.5", 1000)).toBe("1234500");
    expect(scaleDecimalString("12", 1_000_000)).toBe("12000000");
  });

  it("keeps sign and identity scale", () => {
    expect(scaleDecimalString("-1234.5", 1000)).toBe("-1234500");
    expect(scaleDecimalString("77.7", 1)).toBe("77.7");
  });
});

describe("addAmounts / compareAmounts", () => {
  it("adds exactly across signs and fractions", () => {
    expect(addAmounts(["45000000", "75000000"])).toBe("120000000");
    expect(addAmounts(["1.25", "-0.75"])).toBe("0.5");
    expect(addAmounts(["-5", "5"])).toBe("0");
  });

  it("compares magnitudes with signs", () => {
    expect(compareAmounts("100", "99.5")).toBe(1);
    expect(compareAmounts("-2", "1")).toBe(-1);
    expect(compareAmounts("3.10", "3.1")).toBe(0);
  });
});
