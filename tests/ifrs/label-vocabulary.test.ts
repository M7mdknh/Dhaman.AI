/**
 * Caption-variation coverage for the label normalizer.
 *
 * Audited statements express the same figure in many wordings — plurals,
 * loss forms, US-influenced cash-flow phrasing, Arabic. An unmapped caption
 * is not a cosmetic miss: the figure silently disappears from the year the
 * deterministic engine calculates on. A MIS-mapped caption is worse still —
 * a wrong number that reaches the ratios with no signal that anything failed.
 *
 * Every caption below appears in real Saudi/IFRS filings.
 */
import { describe, expect, it } from "vitest";

import { figuresByYear, normalizeLabel, normalizeLineItems } from "@/lib/ifrs/normalizer";

import type { ExtractedLineItem } from "@/lib/ifrs/types";

describe("revenue captions", () => {
  it("maps singular, plural and qualified wordings", () => {
    for (const label of [
      "Revenue",
      "Revenues",
      "Revenue from contracts with customers",
      "Revenues from contracts with customers",
      "Total revenues",
      "Sales",
      "Net sales",
      "Operating revenue",
      "Contract revenue",
      "Turnover",
    ]) {
      expect(normalizeLabel("PROFIT_OR_LOSS", label), label).toBe("revenue");
    }
  });

  it("does not mistake selling costs for revenue", () => {
    expect(normalizeLabel("PROFIT_OR_LOSS", "Sales and marketing expenses")).toBeNull();
    expect(normalizeLabel("PROFIT_OR_LOSS", "Sales and distribution expenses")).toBeNull();
    expect(normalizeLabel("PROFIT_OR_LOSS", "Sales expense")).toBeNull();
  });
});

describe("bottom-line captions", () => {
  it("maps profit wording", () => {
    for (const label of [
      "Net income",
      "Net profit",
      "Profit for the year",
      "Net profit for the year",
      "Profit for the period",
      "Profit after zakat",
      "Profit after tax",
      "Profit attributable to shareholders",
      "Net income for the year attributable to shareholders",
    ]) {
      expect(normalizeLabel("PROFIT_OR_LOSS", label), label).toBe("netIncome");
    }
  });

  // The applicants a bank most needs to assess accurately are the ones
  // reporting losses — their bottom line must never go missing.
  it("maps loss and combined profit/(loss) wording", () => {
    for (const label of [
      "Net loss",
      "Net loss for the year",
      "Loss for the year",
      "Loss for the period",
      "Net (loss) / profit for the year",
      "(Loss) / profit for the year",
      "Profit / (loss) for the year",
      "Net income / (loss)",
    ]) {
      expect(normalizeLabel("PROFIT_OR_LOSS", label), label).toBe("netIncome");
    }
  });

  // A bare outcome word is not the bottom line; these must never pose as it.
  it("rejects non-bottom-line captions containing profit/loss/income", () => {
    for (const label of [
      "Income tax expense",
      "Loss on disposal of property and equipment",
      "Profit before zakat and tax",
      "Other income",
      "Impairment loss on trade receivables",
    ]) {
      expect(normalizeLabel("PROFIT_OR_LOSS", label), label).not.toBe("netIncome");
    }
  });

  it("maps gross and operating outcomes in both directions", () => {
    expect(normalizeLabel("PROFIT_OR_LOSS", "Gross profit")).toBe("grossProfit");
    expect(normalizeLabel("PROFIT_OR_LOSS", "Gross loss")).toBe("grossProfit");
    expect(normalizeLabel("PROFIT_OR_LOSS", "Gross profit / (loss)")).toBe("grossProfit");
    expect(normalizeLabel("PROFIT_OR_LOSS", "Operating profit")).toBe("operatingIncome");
    expect(normalizeLabel("PROFIT_OR_LOSS", "Operating loss")).toBe("operatingIncome");
    expect(normalizeLabel("PROFIT_OR_LOSS", "Loss from operations")).toBe("operatingIncome");
  });

  it("maps cost of sales wordings", () => {
    for (const label of ["Cost of revenue", "Cost of revenues", "Cost of sales", "Direct costs"]) {
      expect(normalizeLabel("PROFIT_OR_LOSS", label), label).toBe("cogs");
    }
  });
});

describe("balance-sheet captions", () => {
  it("maps cash and receivable wordings", () => {
    for (const label of [
      "Cash and cash equivalents",
      "Cash and bank balances",
      "Bank balances and cash",
      "Cash and short-term deposits",
      "Cash on hand and at banks",
    ]) {
      expect(normalizeLabel("FINANCIAL_POSITION", label), label).toBe("cash");
    }
    for (const label of [
      "Trade receivables",
      "Trade and other receivables",
      "Accounts receivable, net",
      "Trade debtors",
    ]) {
      expect(normalizeLabel("FINANCIAL_POSITION", label), label).toBe("receivables");
    }
  });

  /**
   * "Total equity and liabilities" is the balance-sheet GRAND TOTAL — it equals
   * total assets. Claiming it as equity (or as liabilities) silently feeds a
   * figure several times too large into every leverage ratio.
   */
  it("declines combined captions that name both sides of the accounting identity", () => {
    for (const label of [
      "Total equity and liabilities",
      "Total liabilities and equity",
      "Total liabilities and shareholders' equity",
    ]) {
      expect(normalizeLabel("FINANCIAL_POSITION", label), label).toBeNull();
    }
    expect(normalizeLabel("FINANCIAL_POSITION", "إجمالي المطلوبات وحقوق الملكية")).toBeNull();
  });

  it("still maps the genuine equity and liability subtotals", () => {
    expect(normalizeLabel("FINANCIAL_POSITION", "Total equity")).toBe("totalEquity");
    expect(normalizeLabel("FINANCIAL_POSITION", "Total shareholders' equity")).toBe("totalEquity");
    expect(
      normalizeLabel("FINANCIAL_POSITION", "Total equity attributable to shareholders of the Company"),
    ).toBe("totalEquity");
    expect(normalizeLabel("FINANCIAL_POSITION", "Total liabilities")).toBe("totalLiabilities");
  });
});

describe("cash-flow captions", () => {
  it("maps generated/used/provided phrasings", () => {
    for (const label of [
      "Net cash from operating activities",
      "Net cash generated from operating activities",
      "Net cash used in operating activities",
      "Net cash flows from operating activities",
      "Net cash provided by operating activities",
      "Cash flows from operating activities",
    ]) {
      expect(normalizeLabel("CASH_FLOWS", label), label).toBe("operatingCashFlow");
    }
    expect(normalizeLabel("CASH_FLOWS", "Net cash provided by investing activities")).toBe(
      "investingCashFlow",
    );
    expect(normalizeLabel("CASH_FLOWS", "Net cash used in financing activities")).toBe(
      "financingCashFlow",
    );
  });
});

describe("Arabic captions", () => {
  it("maps profit and loss wording", () => {
    expect(normalizeLabel("PROFIT_OR_LOSS", "صافي الربح")).toBe("netIncome");
    expect(normalizeLabel("PROFIT_OR_LOSS", "صافي الخسارة للسنة")).toBe("netIncome");
    expect(normalizeLabel("PROFIT_OR_LOSS", "الإيرادات")).toBe("revenue");
  });

  it("maps balance-sheet totals", () => {
    expect(normalizeLabel("FINANCIAL_POSITION", "إجمالي الموجودات")).toBe("totalAssets");
    expect(normalizeLabel("FINANCIAL_POSITION", "إجمالي المطلوبات")).toBe("totalLiabilities");
    expect(normalizeLabel("FINANCIAL_POSITION", "إجمالي حقوق الملكية")).toBe("totalEquity");
  });
});

describe("statement ordering", () => {
  function bs(label: string, value: string): ExtractedLineItem {
    return {
      statement: "FINANCIAL_POSITION",
      originalLabel: label,
      normalizedKey: null,
      values: [{ fiscalYear: 2025, original: value, normalized: value }],
    };
  }

  /**
   * IFRS permits presenting equity before liabilities. Previously the grand
   * total ("Total liabilities and equity") was read as totalLiabilities and,
   * appearing before the real subtotal, won — overstating leverage 2.5x.
   */
  it("reads the real subtotals regardless of presentation order", () => {
    const figures = figuresByYear(
      normalizeLineItems([
        bs("Total assets", "1000"),
        bs("Total equity", "600"),
        bs("Total liabilities and equity", "1000"),
        bs("Total liabilities", "400"),
      ]),
    ).get(2025);
    expect(figures?.totalEquity).toBe("600");
    expect(figures?.totalLiabilities).toBe("400");
  });

  /** A figure the statement never prints stays absent — never guessed. */
  it("leaves equity absent rather than borrowing the grand total", () => {
    const figures = figuresByYear(
      normalizeLineItems([
        bs("Total assets", "1000"),
        bs("Total liabilities", "400"),
        bs("Total equity and liabilities", "1000"),
      ]),
    ).get(2025);
    expect(figures?.totalEquity).toBeUndefined();
    expect(figures?.totalAssets).toBe("1000");
  });
});
