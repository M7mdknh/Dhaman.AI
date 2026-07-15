import { describe, expect, it } from "vitest";

import {
  detectCurrency,
  detectFiscalYears,
  detectScale,
  extractLineItems,
} from "@/lib/ifrs/line-extractor";
import { figuresByYear, normalizeLabel, normalizeLineItems } from "@/lib/ifrs/normalizer";
import { detectStatements } from "@/lib/ifrs/statement-detector";
import { validateExtraction } from "@/lib/ifrs/validator";

import { STRONG_PROFILE, WEAK_PROFILE } from "../fixtures/company-profiles";
import { financialPositionPage, profilePages } from "../fixtures/statement-text";

const strongPages = profilePages(STRONG_PROFILE);
const strongFullText = strongPages.map((p) => p.text).join("\n");

describe("statement detection", () => {
  it("finds the three primary statements on the right pages", () => {
    const detected = detectStatements(strongPages);
    const byType = Object.fromEntries(detected.map((d) => [d.type, d.pages]));
    expect(byType.FINANCIAL_POSITION).toEqual([1]);
    expect(byType.PROFIT_OR_LOSS).toEqual([2]);
    expect(byType.CASH_FLOWS).toEqual([3]);
  });

  it("skips auditor-report pages", () => {
    const auditor = {
      pageNumber: 1,
      text: "Independent auditor's report\nStatement of Financial Position is presented fairly\n1,000,000 2,000,000 3,000,000\n4,000,000 5,000,000 6,000,000\n7,000,000 8,000,000 9,000,000",
    };
    expect(detectStatements([auditor])).toEqual([]);
  });
});

describe("header detection", () => {
  it("reads scale, currency, and fiscal years", () => {
    expect(detectScale(strongFullText)).toBe(1);
    expect(detectScale("Amounts in thousands ('000)")).toBe(1000);
    expect(detectCurrency(strongFullText)).toBe("SAR");
    expect(
      detectFiscalYears(financialPositionPage(STRONG_PROFILE), strongFullText),
    ).toEqual([2025, 2024]);
  });

  it("accepts the standard \"Note  YYYY  YYYY\" column header", () => {
    expect(detectFiscalYears("Assets\n            Note   2025   2024\n", "")).toEqual([2025, 2024]);
  });

  it("falls back to the reporting date for single-year documents", () => {
    expect(detectFiscalYears("no header", "for the year ended 31 December 2023")).toEqual([2023]);
  });
});

describe("normalization", () => {
  it("maps printed labels to canonical keys, statement-scoped", () => {
    expect(normalizeLabel("PROFIT_OR_LOSS", "Revenue")).toBe("revenue");
    expect(normalizeLabel("PROFIT_OR_LOSS", "Cost of revenue")).toBe("cogs");
    expect(normalizeLabel("PROFIT_OR_LOSS", "Net profit for the year")).toBe("netIncome");
    expect(normalizeLabel("FINANCIAL_POSITION", "Total current assets")).toBe("currentAssets");
    expect(normalizeLabel("FINANCIAL_POSITION", "Total assets")).toBe("totalAssets");
    expect(normalizeLabel("FINANCIAL_POSITION", "Trade receivables")).toBe("receivables");
    expect(normalizeLabel("CASH_FLOWS", "Net cash from operating activities")).toBe("operatingCashFlow");
    expect(normalizeLabel("CASH_FLOWS", "Purchase of property, plant and equipment")).toBe("capex");
    // Statement scoping: "Revenue" on a balance sheet is NOT revenue.
    expect(normalizeLabel("FINANCIAL_POSITION", "Revenue")).toBeNull();
    expect(normalizeLabel("PROFIT_OR_LOSS", "Some unheard-of line")).toBeNull();
  });
});

describe("end-to-end text extraction", () => {
  function extractProfileFigures(profile: typeof STRONG_PROFILE) {
    const pages = profilePages(profile);
    const fullText = pages.map((p) => p.text).join("\n");
    const statements = detectStatements(pages);
    const items = statements.flatMap((s) => {
      const sPages = pages.filter((p) => s.pages.includes(p.pageNumber));
      const years = detectFiscalYears(sPages.map((p) => p.text).join("\n"), fullText);
      return extractLineItems(s.type, sPages, years, detectScale(fullText));
    });
    return { statements, figures: figuresByYear(normalizeLineItems(items)) };
  }

  it("extracts the strong profile's figures exactly", () => {
    const { statements, figures } = extractProfileFigures(STRONG_PROFILE);
    const fy2025 = figures.get(2025)!;
    const fy2024 = figures.get(2024)!;

    expect(fy2025.revenue).toBe("120000000");
    expect(fy2025.cogs).toBe("-84000000"); // printed in parentheses
    expect(fy2025.totalAssets).toBe("120000000");
    expect(fy2025.totalEquity).toBe("75000000");
    expect(fy2025.operatingCashFlow).toBe("20000000");
    expect(fy2024.revenue).toBe("100000000");
    expect(fy2024.netIncome).toBe("10500000");

    const validation = validateExtraction(statements, figures);
    expect(validation.errors).toEqual([]);
  });

  it("captures negative figures for the weak profile", () => {
    const { figures } = extractProfileFigures(WEAK_PROFILE);
    const fy2025 = figures.get(2025)!;
    expect(fy2025.netIncome).toBe("-2800000");
    expect(fy2025.operatingCashFlow).toBe("-1500000");
  });
});

describe("vertical (cell-per-line) layouts", () => {
  // Real audited statements (e.g. big-four consumer-finance reports) emit one
  // table CELL per text line: label, note reference, then one amount per year.
  const verticalBalanceSheet = [
    "CONSOLIDATED STATEMENT OF FINANCIAL POSITION",
    "(All amounts in Saudi Riyal thousands unless otherwise stated)",
    "Note",
    "As at",
    "December 31,",
    "2025",
    "As at",
    "December 31,",
    "2024",
    "Assets",
    "Cash and cash equivalents",
    "4",
    "767,239",
    "487,282",
    "Consumer receivables, net",
    "5",
    "4,052,287",
    "1,651,768",
    "Due from related parties",
    "7.1",
    "-",
    "2,263",
    "Total assets",
    "4,985,398",
    "2,241,607",
    "Other reserves",
    "13, 15",
    "35,750",
    "22,708",
    "Total liabilities",
    "4,429,792",
    "1,892,390",
    "Total shareholder’s equity",
    "555,606",
    "349,217",
  ].join("\n");

  const verticalCashFlows = [
    "CONSOLIDATED STATEMENT OF CASH FLOWS",
    "Note",
    "For the year ended",
    "December 31, 2025",
    "For the year ended",
    "December 31, 2024",
    "Cash flow from operating activities",
    "Net cash used in operating activities",
    " ",
    "(1,727,922)",
    "(553,187)",
    "Income tax paid",
    "9.2",
    "-",
    "(6,531)",
    "Net cash used in operating activities",
    "(1,941,137)",
    "(700,967)",
    "Purchase of property and equipment",
    "10",
    "(5,669)",
    "(10,457)",
    "Net cash used in investing activity",
    "(5,669)",
    "(10,457)",
  ].join("\n");

  it("detects fiscal years from a header that never puts two years on one line", () => {
    expect(detectFiscalYears(verticalBalanceSheet, "")).toEqual([2025, 2024]);
    expect(detectFiscalYears(verticalCashFlows, "")).toEqual([2025, 2024]);
  });

  it("reassembles label + note + per-year amount lines into figures", () => {
    const pages = [{ pageNumber: 1, text: verticalBalanceSheet }];
    const items = extractLineItems("FINANCIAL_POSITION", pages, [2025, 2024], 1000);
    const figures = figuresByYear(normalizeLineItems(items));
    const fy2025 = figures.get(2025)!;
    const fy2024 = figures.get(2024)!;

    expect(fy2025.cash).toBe("767239000");
    expect(fy2025.receivables).toBe("4052287000");
    expect(fy2025.totalAssets).toBe("4985398000");
    expect(fy2025.totalLiabilities).toBe("4429792000");
    expect(fy2025.totalEquity).toBe("555606000"); // "Total shareholder’s equity"
    expect(fy2024.cash).toBe("487282000");
    expect(fy2024.totalEquity).toBe("349217000");
  });

  it("keeps printed nil cells ('-') aligned to their year column", () => {
    const pages = [{ pageNumber: 1, text: verticalBalanceSheet }];
    const items = extractLineItems("FINANCIAL_POSITION", pages, [2025, 2024], 1000);
    const related = items.find((i) => /due from related/i.test(i.originalLabel))!;
    expect(related.values).toEqual([
      { fiscalYear: 2025, original: "0", normalized: "0" },
      { fiscalYear: 2024, original: "2,263", normalized: "2263000" },
    ]);
  });

  it("takes the LAST repeated cash-flow subtotal as the statement total", () => {
    const pages = [{ pageNumber: 1, text: verticalCashFlows }];
    const items = extractLineItems("CASH_FLOWS", pages, [2025, 2024], 1000);
    const figures = figuresByYear(normalizeLineItems(items));
    expect(figures.get(2025)!.operatingCashFlow).toBe("-1941137000");
    expect(figures.get(2025)!.capex).toBe("-5669000");
    expect(figures.get(2025)!.investingCashFlow).toBe("-5669000"); // "activity", singular
    expect(figures.get(2024)!.operatingCashFlow).toBe("-700967000");
  });
});

describe("validation", () => {
  it("errors when required statements are missing", () => {
    const outcome = validateExtraction([], new Map());
    const codes = outcome.errors.map((e) => e.code);
    expect(codes).toContain("MISSING_FINANCIAL_POSITION");
    expect(codes).toContain("MISSING_PROFIT_OR_LOSS");
    expect(codes).toContain("MISSING_CASH_FLOWS");
    expect(codes).toContain("NO_FISCAL_YEARS");
  });

  it("warns when the balance sheet does not balance", () => {
    const figures = new Map([
      [2025, { totalAssets: "100000000", totalLiabilities: "40000000", totalEquity: "50000000" }],
    ]);
    const outcome = validateExtraction(
      [
        { type: "FINANCIAL_POSITION", pages: [1] },
        { type: "PROFIT_OR_LOSS", pages: [2] },
        { type: "CASH_FLOWS", pages: [3] },
      ],
      figures,
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings.some((w) => w.code === "BALANCE_MISMATCH")).toBe(true);
  });
});
