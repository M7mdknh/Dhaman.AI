/**
 * Ratio evidence — the "show your work" layer behind every printed ratio.
 * For each fiscal year and ratio it names the exact numerator/denominator
 * (as raw money strings) and the formula, so the officer can click any figure
 * and see precisely which statement lines produced it.
 *
 * Serializable by construction (plain strings/numbers), so it crosses the
 * server→client boundary the ratio table lives on. Never recomputes the ratio
 * itself — the displayed value stays the engine's; this only exposes the inputs.
 */
import { sub } from "@/lib/finance/decimal";
import {
  derivedDebtService,
  derivedGrossProfit,
  derivedTotalDebt,
} from "@/services/finance/financial-ratio-service";
import { toYearFinancials } from "@/services/finance/financial-intelligence-service";

import type { Money, RatioKey, YearFinancials } from "@/lib/finance/types";
import type { FinancialStatement } from "@/generated/prisma/client";

/** One operand of a ratio: a statement line and its raw money value. */
export interface EvidencePart {
  label: string;
  /** Decimal string (formatted to money on the client), or null when absent. */
  value: string | null;
}

export interface RatioEvidence {
  /** Human formula, e.g. "Current Assets ÷ Current Liabilities". */
  formula: string;
  numerator: EvidencePart;
  denominator: EvidencePart;
  /** Set when the ratio is intentionally not computed (e.g. equity ≤ 0). */
  note?: string;
}

export type RatioEvidenceByYear = Record<number, Partial<Record<RatioKey, RatioEvidence>>>;

const m = (d: Money | null): string | null => (d === null ? null : d.toFixed(2));

/** Evidence for every ratio in one fiscal year. */
function yearEvidence(y: YearFinancials): Partial<Record<RatioKey, RatioEvidence>> {
  const equityPositive = y.totalEquity != null && y.totalEquity.gt(0);
  const equityNote = equityPositive ? undefined : "Equity is non-positive — the ratio is not meaningful.";
  const grossProfit = derivedGrossProfit(y);
  const totalDebt = derivedTotalDebt(y);
  const debtService = derivedDebtService(y);

  return {
    // Liquidity
    currentRatio: {
      formula: "Current Assets ÷ Current Liabilities",
      numerator: { label: "Current Assets", value: m(y.currentAssets) },
      denominator: { label: "Current Liabilities", value: m(y.currentLiabilities) },
    },
    quickRatio: {
      formula: "(Current Assets − Inventory) ÷ Current Liabilities",
      numerator: { label: "Current Assets − Inventory", value: m(sub(y.currentAssets, y.inventory)) },
      denominator: { label: "Current Liabilities", value: m(y.currentLiabilities) },
    },
    cashRatio: {
      formula: "Cash ÷ Current Liabilities",
      numerator: { label: "Cash & Equivalents", value: m(y.cash) },
      denominator: { label: "Current Liabilities", value: m(y.currentLiabilities) },
    },
    // Leverage
    debtRatio: {
      formula: "Total Liabilities ÷ Total Assets",
      numerator: { label: "Total Liabilities", value: m(y.totalLiabilities) },
      denominator: { label: "Total Assets", value: m(y.totalAssets) },
    },
    debtToEquity: {
      formula: "Total Liabilities ÷ Total Equity",
      numerator: { label: "Total Liabilities", value: m(y.totalLiabilities) },
      denominator: { label: "Total Equity", value: m(y.totalEquity) },
      note: equityNote,
    },
    debtToAssets: {
      formula: "Total Debt ÷ Total Assets",
      numerator: { label: "Total Debt (short + long term)", value: m(totalDebt) },
      denominator: { label: "Total Assets", value: m(y.totalAssets) },
    },
    interestCoverage: {
      formula: "Operating Income ÷ Interest Expense",
      numerator: { label: "Operating Income", value: m(y.operatingIncome) },
      denominator: { label: "Interest Expense", value: m(y.interestExpense) },
    },
    // Profitability
    grossMargin: {
      formula: "Gross Profit ÷ Revenue",
      numerator: { label: "Gross Profit", value: m(grossProfit) },
      denominator: { label: "Revenue", value: m(y.revenue) },
    },
    operatingMargin: {
      formula: "Operating Income ÷ Revenue",
      numerator: { label: "Operating Income", value: m(y.operatingIncome) },
      denominator: { label: "Revenue", value: m(y.revenue) },
    },
    netMargin: {
      formula: "Net Income ÷ Revenue",
      numerator: { label: "Net Income", value: m(y.netIncome) },
      denominator: { label: "Revenue", value: m(y.revenue) },
    },
    returnOnAssets: {
      formula: "Net Income ÷ Total Assets",
      numerator: { label: "Net Income", value: m(y.netIncome) },
      denominator: { label: "Total Assets", value: m(y.totalAssets) },
    },
    returnOnEquity: {
      formula: "Net Income ÷ Total Equity",
      numerator: { label: "Net Income", value: m(y.netIncome) },
      denominator: { label: "Total Equity", value: m(y.totalEquity) },
      note: equityNote,
    },
    ebitdaMargin: {
      formula: "EBITDA ÷ Revenue",
      numerator: { label: "EBITDA", value: m(y.ebitda) },
      denominator: { label: "Revenue", value: m(y.revenue) },
    },
    // Efficiency
    assetTurnover: {
      formula: "Revenue ÷ Total Assets",
      numerator: { label: "Revenue", value: m(y.revenue) },
      denominator: { label: "Total Assets", value: m(y.totalAssets) },
    },
    inventoryTurnover: {
      formula: "COGS ÷ Inventory",
      numerator: { label: "Cost of Goods Sold", value: m(y.cogs) },
      denominator: { label: "Inventory", value: m(y.inventory) },
    },
    receivableTurnover: {
      formula: "Revenue ÷ Trade Receivables",
      numerator: { label: "Revenue", value: m(y.revenue) },
      denominator: { label: "Trade Receivables", value: m(y.receivables) },
    },
    // Cash flow & coverage
    operatingCashFlowRatio: {
      formula: "Operating Cash Flow ÷ Current Liabilities",
      numerator: { label: "Operating Cash Flow", value: m(y.operatingCashFlow) },
      denominator: { label: "Current Liabilities", value: m(y.currentLiabilities) },
    },
    dscr: {
      formula: "EBITDA ÷ Debt Service",
      numerator: { label: "EBITDA", value: m(y.ebitda) },
      denominator: { label: "Debt Service (interest + current maturities)", value: m(debtService) },
    },
    ebitdaCoverage: {
      formula: "EBITDA ÷ Interest Expense",
      numerator: { label: "EBITDA", value: m(y.ebitda) },
      denominator: { label: "Interest Expense", value: m(y.interestExpense) },
    },
  };
}

/** Ratio evidence for every validated fiscal year, keyed by year. */
export function buildRatioEvidence(statements: FinancialStatement[]): RatioEvidenceByYear {
  const out: RatioEvidenceByYear = {};
  for (const statement of statements) {
    const y = toYearFinancials(statement);
    out[y.fiscalYear] = yearEvidence(y);
  }
  return out;
}
