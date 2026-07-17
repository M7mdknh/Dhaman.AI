/**
 * Financial Integrity Validator — the gate between extraction and the engine.
 *
 * Two failure modes are being defended against, and they pull in opposite
 * directions: letting impossible figures through (a fabricated assessment),
 * and rejecting a distressed-but-real applicant (hiding the case underwriting
 * exists to catch). Both are tested here.
 */
import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  blockingSummary,
  usableStatements,
  validateFinancialIntegrity,
} from "@/services/finance/financial-integrity-validator";
import { buildFinancialIntelligence } from "@/services/finance/financial-intelligence-service";

import { STRONG_PROFILE, WEAK_PROFILE } from "../fixtures/company-profiles";

import type { FinancialStatement } from "@/generated/prisma/client";
import type { YearFigures } from "../fixtures/company-profiles";

const D = (n: number) => new Prisma.Decimal(n);

/** A Prisma-shaped statement row; every money column defaults to present. */
function statement(over: Partial<FinancialStatement> & { fiscalYear: number }): FinancialStatement {
  return {
    id: `fs-${over.fiscalYear}`,
    caseId: "case-1",
    documentId: "doc-1",
    currency: "SAR",
    audited: true,
    statementType: "AUDITED",
    revenue: D(40_000_000),
    cogs: D(-30_000_000),
    grossProfit: D(10_000_000),
    operatingIncome: D(6_000_000),
    netIncome: D(4_000_000),
    ebitda: null,
    depreciationAmortization: null,
    interestExpense: D(-1_000_000),
    cash: D(5_000_000),
    receivables: D(12_000_000),
    inventory: D(8_000_000),
    currentAssets: D(25_000_000),
    totalAssets: D(50_000_000),
    currentLiabilities: D(15_000_000),
    totalLiabilities: D(30_000_000),
    shortTermDebt: D(10_000_000),
    longTermDebt: D(15_000_000),
    totalDebt: D(25_000_000),
    totalEquity: D(20_000_000), // 30 + 20 = 50 ✓ balances
    operatingCashFlow: D(7_000_000),
    investingCashFlow: D(-2_000_000),
    financingCashFlow: D(-1_000_000),
    capex: D(-2_000_000),
    annualDebtService: null,
    sourceJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

/** A profile year as the parser would have stored it. */
function fromProfile(f: YearFigures): FinancialStatement {
  return statement({
    fiscalYear: f.fiscalYear,
    revenue: D(f.revenue),
    cogs: D(-f.cogs),
    grossProfit: D(f.grossProfit),
    operatingIncome: D(f.operatingIncome),
    netIncome: D(f.netIncome),
    interestExpense: D(-f.financeCosts),
    cash: D(f.cash),
    receivables: D(f.receivables),
    inventory: D(f.inventory),
    currentAssets: D(f.currentAssets),
    totalAssets: D(f.totalAssets),
    currentLiabilities: D(f.currentLiabilities),
    totalLiabilities: D(f.totalLiabilities),
    shortTermDebt: D(f.shortTermDebt),
    longTermDebt: D(f.longTermDebt),
    totalDebt: null,
    totalEquity: D(f.totalEquity),
    operatingCashFlow: D(f.operatingCashFlow),
    investingCashFlow: D(f.investingCashFlow),
    financingCashFlow: D(f.financingCashFlow),
    capex: D(-f.capex),
  });
}

const codes = (s: FinancialStatement[]) => validateFinancialIntegrity(s).findings.map((f) => f.code);

describe("valid data passes untouched", () => {
  it("accepts healthy audited statements", () => {
    const report = validateFinancialIntegrity(STRONG_PROFILE.years.map(fromProfile));
    expect(report.ok).toBe(true);
    expect(report.rejectedYears).toEqual([]);
    expect(report.findings.filter((f) => f.severity === "BLOCKING")).toEqual([]);
  });

  /**
   * The whole point of underwriting: a distressed applicant must reach the
   * risk engine, not be filtered out as "bad data". Negative net income,
   * negative operating cash flow and collapsing revenue are all VALID.
   */
  it("accepts a distressed applicant — losses are data, not errors", () => {
    const weak = WEAK_PROFILE.years.map(fromProfile);
    const report = validateFinancialIntegrity(weak);
    expect(report.ok).toBe(true);
    expect(report.rejectedYears).toEqual([]);
    // The fixture really is distressed — guards against a fixture that drifts healthy.
    expect(WEAK_PROFILE.years[0].netIncome).toBeLessThan(0);
    expect(WEAK_PROFILE.years[0].operatingCashFlow).toBeLessThan(0);
  });

  it("accepts negative equity — insolvency is a finding for the risk engine", () => {
    const rows = [statement({ fiscalYear: 2025, totalLiabilities: D(60_000_000), totalEquity: D(-10_000_000) })];
    // 60 + (−10) = 50 = total assets → still balances.
    expect(validateFinancialIntegrity(rows).ok).toBe(true);
  });
});

describe("impossible figures are blocked", () => {
  it("rejects negative revenue", () => {
    const rows = [statement({ fiscalYear: 2025, revenue: D(-2_500_000) })];
    const report = validateFinancialIntegrity(rows);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.code === "IMPOSSIBLE_NEGATIVE")).toBe(true);
    const summary = blockingSummary(report);
    expect(summary).toContain("cannot be negative"); // what is wrong
    expect(summary).toContain("wrong rows"); // why
    expect(summary).toContain("Upload the standalone audited financial statements"); // what next
  });

  it("rejects negative cash and negative total assets", () => {
    expect(codes([statement({ fiscalYear: 2025, cash: D(-1) })])).toContain("IMPOSSIBLE_NEGATIVE");
    expect(codes([statement({ fiscalYear: 2025, totalAssets: D(-1) })])).toContain("IMPOSSIBLE_NEGATIVE");
  });

  it("rejects a year missing CORE figures", () => {
    const rows = [statement({ fiscalYear: 2025, netIncome: null, totalEquity: null })];
    const report = validateFinancialIntegrity(rows);
    expect(report.ok).toBe(false);
    const finding = report.findings.find((f) => f.code === "MISSING_CORE_FIGURES");
    expect(finding?.message).toContain("Net Income");
    expect(finding?.message).toContain("Total Equity");
  });

  /**
   * The real-world case that motivated this validator: one revenue figure
   * extracted from a scanned annual report, everything else absent — and the
   * engine happily returned "LOW risk, score 17".
   */
  it("rejects a year carrying revenue and nothing else", () => {
    const rows = [
      statement({
        fiscalYear: 2024,
        revenue: D(75_900_000_000),
        netIncome: null,
        totalAssets: null,
        totalLiabilities: null,
        totalEquity: null,
        operatingCashFlow: null,
      }),
    ];
    expect(validateFinancialIntegrity(rows).ok).toBe(false);
    expect(buildFinancialIntelligence(rows, null)).toBeNull();
  });

  it("rejects a balance sheet that does not balance", () => {
    const rows = [statement({ fiscalYear: 2025, totalEquity: D(35_000_000) })]; // 30 + 35 ≠ 50
    const report = validateFinancialIntegrity(rows);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.code === "BALANCE_SHEET_DOES_NOT_BALANCE")).toBe(true);
  });

  it("names the grand-total mis-mapping when equity equals total assets", () => {
    const rows = [statement({ fiscalYear: 2025, totalEquity: D(50_000_000) })]; // == totalAssets
    const finding = validateFinancialIntegrity(rows).findings.find(
      (f) => f.code === "BALANCE_SHEET_DOES_NOT_BALANCE",
    );
    expect(finding?.message).toContain("grand total");
  });

  it("tolerates rounding within the configured tolerance", () => {
    // 0.5% drift on 50,000,000 — inside the 1% bound.
    const rows = [statement({ fiscalYear: 2025, totalEquity: D(20_250_000) })];
    expect(validateFinancialIntegrity(rows).ok).toBe(true);
  });

  it("rejects a subtotal larger than its total", () => {
    expect(codes([statement({ fiscalYear: 2025, currentAssets: D(60_000_000) })])).toContain(
      "SUBTOTAL_EXCEEDS_TOTAL",
    );
    expect(
      codes([statement({ fiscalYear: 2025, currentLiabilities: D(31_000_000) })]),
    ).toContain("SUBTOTAL_EXCEEDS_TOTAL");
  });

  /** The latest year anchors the currency: a mis-read HISTORICAL currency
   * withholds that year only — it never blocks the current assessment. */
  it("withholds only the years whose currency differs from the latest", () => {
    const rows = [
      statement({ fiscalYear: 2025, currency: "SAR" }),
      statement({ fiscalYear: 2024, currency: "USD" }),
    ];
    const report = validateFinancialIntegrity(rows);
    expect(report.ok).toBe(true);
    expect(report.usableYears).toEqual([2025]);
    expect(report.rejectedYears).toEqual([2024]);
    const finding = report.findings.find((f) => f.code === "CURRENCY_INCONSISTENT");
    expect(finding?.fiscalYear).toBe(2024);
  });

  it("rejects a duplicate fiscal year", () => {
    const rows = [statement({ fiscalYear: 2025 }), statement({ fiscalYear: 2025 })];
    expect(codes(rows)).toContain("DUPLICATE_FISCAL_YEAR");
  });

  it("reports nothing usable when there are no statements at all", () => {
    const report = validateFinancialIntegrity([]);
    expect(report.ok).toBe(false);
    expect(report.findings[0].code).toBe("NO_STATEMENTS");
  });
});

describe("warnings let the assessment continue", () => {
  it("warns on a 100x scale jump between years", () => {
    // FY2024 read in thousands: internally consistent, but 1000x off FY2025.
    const thousands = statement({
      fiscalYear: 2024,
      revenue: D(40_000),
      cogs: D(-30_000),
      grossProfit: D(10_000),
      operatingIncome: D(6_000),
      netIncome: D(4_000),
      interestExpense: D(-1_000),
      cash: D(5_000),
      receivables: D(12_000),
      inventory: D(8_000),
      currentAssets: D(25_000),
      totalAssets: D(50_000),
      currentLiabilities: D(15_000),
      totalLiabilities: D(30_000),
      shortTermDebt: D(10_000),
      longTermDebt: D(15_000),
      totalDebt: D(25_000),
      totalEquity: D(20_000),
      operatingCashFlow: D(7_000),
      investingCashFlow: D(-2_000),
      financingCashFlow: D(-1_000),
      capex: D(-2_000),
    });
    const rows = [statement({ fiscalYear: 2025 }), thousands];
    const report = validateFinancialIntegrity(rows);
    expect(report.ok).toBe(true); // continues, with reduced confidence
    const finding = report.findings.find((f) => f.code === "SCALE_INCONSISTENT");
    expect(finding?.severity).toBe("WARNING");
    expect(finding?.message).toContain("units");
  });

  it("warns when net income dwarfs revenue", () => {
    const rows = [statement({ fiscalYear: 2025, netIncome: D(500_000_000) })];
    const report = validateFinancialIntegrity(rows);
    expect(report.ok).toBe(true);
    expect(report.findings.some((f) => f.code === "NET_INCOME_IMPLAUSIBLE_VS_REVENUE")).toBe(true);
  });

  it("warns on an impossible current ratio rather than blocking", () => {
    const rows = [statement({ fiscalYear: 2025, currentLiabilities: D(1), currentAssets: D(25_000_000) })];
    const report = validateFinancialIntegrity(rows);
    const finding = report.findings.find((f) => f.code === "RATIO_IMPLAUSIBLE");
    expect(finding?.severity).toBe("WARNING");
  });
});

describe("informational findings", () => {
  it("notes a single-year assessment", () => {
    const report = validateFinancialIntegrity([statement({ fiscalYear: 2025 })]);
    const finding = report.findings.find((f) => f.code === "SINGLE_YEAR_ONLY");
    expect(finding?.severity).toBe("INFO");
  });

  it("notes a gap between fiscal years", () => {
    const rows = [statement({ fiscalYear: 2025 }), statement({ fiscalYear: 2023 })];
    expect(codes(rows)).toContain("FISCAL_YEAR_GAP");
  });
});

describe("partial years: one bad year never fails the case", () => {
  it("withholds the invalid year and assesses the rest", () => {
    const rows = [
      statement({ fiscalYear: 2025 }),
      statement({ fiscalYear: 2024, revenue: D(-1) }), // impossible
    ];
    const report = validateFinancialIntegrity(rows);
    expect(report.ok).toBe(true);
    expect(report.usableYears).toEqual([2025]);
    expect(report.rejectedYears).toEqual([2024]);
    expect(usableStatements(rows, report).map((s) => s.fiscalYear)).toEqual([2025]);
    expect(codes(rows)).toContain("PARTIAL_YEARS_WITHHELD");
  });
});

describe("the engine refuses invalid input at its own door", () => {
  it("computes only on the years that passed", () => {
    const rows = [
      statement({ fiscalYear: 2025 }),
      statement({ fiscalYear: 2024, totalEquity: D(35_000_000) }), // does not balance
    ];
    const report = buildFinancialIntelligence(rows, null);
    expect(report).not.toBeNull();
    expect(report?.years).toEqual([2025]);
    expect(report?.latestYear).toBe(2025);
  });

  it("returns null — no score, no recommendation — when no year survives", () => {
    const rows = [statement({ fiscalYear: 2025, revenue: D(-1) })];
    expect(buildFinancialIntelligence(rows, null)).toBeNull();
  });
});
