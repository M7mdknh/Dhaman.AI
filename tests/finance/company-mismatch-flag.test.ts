import { describe, expect, it } from "vitest";

import { detectCompanyMismatchFlags } from "@/services/finance/risk-flag-service";

describe("company name mismatch flag", () => {
  it("flags statements printed for a different company", () => {
    const flags = detectCompanyMismatchFlags("Tamara", [
      { companyName: "RAWABI CONTRACTING CO.", fiscalYear: 2025 },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("COMPANY_NAME_MISMATCH");
    expect(flags[0].severity).toBe("HIGH");
    expect(flags[0].affectedYears).toEqual([2025]);
    expect(flags[0].explanation).toContain("RAWABI CONTRACTING CO.");
    expect(flags[0].explanation).toContain("Tamara");
  });

  it("accepts containment matches (legal-form suffixes, longer legal names)", () => {
    expect(
      detectCompanyMismatchFlags("Tamara", [
        { companyName: "TAMARA FINANCE COMPANY", fiscalYear: 2025 },
      ]),
    ).toEqual([]);
    expect(
      detectCompanyMismatchFlags("Rawabi Contracting Co.", [
        { companyName: "RAWABI CONTRACTING CO", fiscalYear: 2025 },
      ]),
    ).toEqual([]);
  });

  it("ignores punctuation and casing differences", () => {
    expect(
      detectCompanyMismatchFlags("Al-Faisal Trading & Contracting Est.", [
        { companyName: "AL FAISAL TRADING  CONTRACTING EST", fiscalYear: 2024 },
      ]),
    ).toEqual([]);
  });

  it("never flags statements whose name the parser could not read", () => {
    expect(
      detectCompanyMismatchFlags("Tamara", [{ companyName: null, fiscalYear: 2025 }]),
    ).toEqual([]);
  });

  it("deduplicates identical extracted names across documents", () => {
    const flags = detectCompanyMismatchFlags("Tamara", [
      { companyName: "RAWABI CONTRACTING CO.", fiscalYear: 2024 },
      { companyName: "Rawabi Contracting Co.", fiscalYear: 2025 },
    ]);
    expect(flags).toHaveLength(1);
  });

  it("skips degenerate applicant names rather than guessing", () => {
    expect(
      detectCompanyMismatchFlags("--", [
        { companyName: "RAWABI CONTRACTING CO.", fiscalYear: 2025 },
      ]),
    ).toEqual([]);
  });
});
