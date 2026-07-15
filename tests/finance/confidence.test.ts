/**
 * Assessment Confidence + Validation Report — the presentation layer over the
 * Financial Integrity Validator. These tests assert what a Risk Officer is
 * TOLD, which is a separate concern from what the validator decided.
 */
import { describe, expect, it } from "vitest";

import {
  assessmentConfidence,
  buildValidationReport,
  contractorNotice,
  needsValidationReport,
} from "@/lib/finance/confidence";

import type {
  IntegrityFinding,
  IntegrityReport,
} from "@/services/finance/financial-integrity-validator";

function finding(over: Partial<IntegrityFinding> = {}): IntegrityFinding {
  return {
    code: "BALANCE_SHEET_DOES_NOT_BALANCE",
    severity: "BLOCKING",
    fiscalYear: 2025,
    message: "FY2025: assets do not equal liabilities + equity.",
    ...over,
  };
}

function report(over: Partial<IntegrityReport> = {}): IntegrityReport {
  return {
    ok: true,
    findings: [],
    usableYears: [2025, 2024],
    rejectedYears: [],
    ...over,
  };
}

describe("confidence level", () => {
  it("is HIGH when everything validated", () => {
    expect(assessmentConfidence(report())).toBe("HIGH");
  });

  it("is MEDIUM when a check warned", () => {
    const r = report({ findings: [finding({ severity: "WARNING", code: "SCALE_INCONSISTENT" })] });
    expect(assessmentConfidence(r)).toBe("MEDIUM");
  });

  it("is MEDIUM when a year was withheld but an assessment exists", () => {
    const r = report({ usableYears: [2025], rejectedYears: [2024], findings: [finding({ fiscalYear: 2024 })] });
    expect(assessmentConfidence(r)).toBe("MEDIUM");
  });

  it("is LOW when nothing survived validation", () => {
    const r = report({ ok: false, usableYears: [], rejectedYears: [2025], findings: [finding()] });
    expect(assessmentConfidence(r)).toBe("LOW");
  });

  /** Context is not doubt: a single-year case is fully validated. */
  it("stays HIGH when only INFO findings exist", () => {
    const r = report({
      usableYears: [2025],
      findings: [finding({ severity: "INFO", code: "SINGLE_YEAR_ONLY" })],
    });
    expect(assessmentConfidence(r)).toBe("HIGH");
    expect(needsValidationReport(r)).toBe(false);
  });
});

describe("validation report", () => {
  it("is not raised when nothing needs saying", () => {
    expect(needsValidationReport(report())).toBe(false);
  });

  it("is raised for warnings and for blocking errors", () => {
    expect(needsValidationReport(report({ findings: [finding({ severity: "WARNING" })] }))).toBe(true);
    expect(needsValidationReport(report({ findings: [finding()] }))).toBe(true);
  });

  it("answers what happened, which statements, which figures, and what to do", () => {
    const r = report({
      usableYears: [2025],
      rejectedYears: [2024],
      findings: [
        finding({
          fiscalYear: 2024,
          code: "MISSING_CORE_FIGURES",
          message: "FY2024 is missing Net Income, Total Equity.",
        }),
      ],
    });
    const view = buildValidationReport(r);

    expect(view.confidence.level).toBe("MEDIUM");
    expect(view.summary).toContain("FY2024"); // what happened
    expect(view.affectedYears).toEqual([2024]); // which statements
    expect(view.excludedYears).toEqual([2024]);
    expect(view.assessedYears).toEqual([2025]);
    expect(view.issues[0].title).toBe("Required figures are missing from this statement");
    expect(view.issues[0].detail).toContain("Net Income"); // which figures
    expect(view.recommendedAction).toContain("FY2024"); // what to do
  });

  it("says plainly that no recommendation was produced when confidence is LOW", () => {
    const r = report({ ok: false, usableYears: [], rejectedYears: [2025], findings: [finding()] });
    const view = buildValidationReport(r);
    expect(view.confidence.level).toBe("LOW");
    expect(view.confidence.summary).toContain("no underwriting recommendation");
    expect(view.assessedYears).toEqual([]);
    expect(view.recommendedAction).toContain("re-upload");
  });

  it("leads with the worst news", () => {
    const r = report({
      ok: false,
      usableYears: [],
      rejectedYears: [2025],
      findings: [
        finding({ severity: "INFO", code: "SINGLE_YEAR_ONLY" }),
        finding({ severity: "WARNING", code: "SCALE_INCONSISTENT" }),
        finding({ severity: "BLOCKING" }),
      ],
    });
    expect(buildValidationReport(r).issues.map((i) => i.severity)).toEqual([
      "BLOCKING",
      "WARNING",
      "INFO",
    ]);
  });

  /** An unmapped code must never leak a raw identifier into the UI. */
  it("falls back to a neutral heading for an unknown code", () => {
    const r = report({ findings: [finding({ code: "SOME_FUTURE_CODE", severity: "WARNING" })] });
    const [issue] = buildValidationReport(r).issues;
    expect(issue.title).toBe("A validation check did not pass");
    expect(issue.title).not.toContain("SOME_FUTURE_CODE");
  });

  it("covers every code the validator can emit", () => {
    // Guards against a new validator code shipping with no human heading.
    const codes = [
      "NO_STATEMENTS",
      "MISSING_CORE_FIGURES",
      "IMPOSSIBLE_NEGATIVE",
      "BALANCE_SHEET_DOES_NOT_BALANCE",
      "SUBTOTAL_EXCEEDS_TOTAL",
      "CURRENCY_INCONSISTENT",
      "DUPLICATE_FISCAL_YEAR",
      "SCALE_INCONSISTENT",
      "NET_INCOME_IMPLAUSIBLE_VS_REVENUE",
      "RATIO_IMPLAUSIBLE",
      "SINGLE_YEAR_ONLY",
      "FISCAL_YEAR_GAP",
      "PARTIAL_YEARS_WITHHELD",
    ];
    for (const code of codes) {
      const view = buildValidationReport(report({ findings: [finding({ code, severity: "WARNING" })] }));
      expect(view.issues[0].title, code).not.toBe("A validation check did not pass");
    }
  });
});

describe("contractor notice", () => {
  /**
   * The applicant must never read a validation failure as a judgement on their
   * business, and must never be shown the officer's arithmetic.
   */
  it("blames the document, never the company, and shows no figures", () => {
    const { title, body } = contractorNotice();
    expect(`${title} ${body}`).toMatch(/verify/i);
    expect(body).toContain("not about your company");
    expect(body).toMatch(/upload the original audited financial statements|retry/i);
    expect(body).not.toMatch(/\d{3,}/); // no amounts
    expect(body).not.toMatch(/liabilit|equity|tolerance|OCR|parse|extract/i);
  });
});
