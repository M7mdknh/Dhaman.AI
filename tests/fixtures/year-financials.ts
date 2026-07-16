/**
 * Bridges the shared company profiles into engine inputs, replicating the
 * parser's sign conventions (expenses stored negative) and the
 * orchestrator's magnitude normalization.
 */
import { Prisma } from "@/generated/prisma/client";

import type { YearFinancials } from "@/lib/finance/types";
import type { YearFigures } from "./company-profiles";

const D = (n: number) => new Prisma.Decimal(n);

/** Engine-ready figures for one profile year (post sign-normalization). */
export function toEngineYear(f: YearFigures): YearFinancials {
  return {
    fiscalYear: f.fiscalYear,
    revenue: D(f.revenue),
    cogs: D(f.cogs), // magnitude (orchestrator abs()s the stored negative)
    grossProfit: D(f.grossProfit),
    operatingIncome: D(f.operatingIncome),
    netIncome: D(f.netIncome),
    ebitda: null, // never printed (non-IFRS) — the engine derives it from D&A
    depreciationAmortization: D(f.depreciationAmortization),
    interestExpense: D(f.financeCosts),
    cash: D(f.cash),
    receivables: D(f.receivables),
    inventory: D(f.inventory),
    currentAssets: D(f.currentAssets),
    totalAssets: D(f.totalAssets),
    currentLiabilities: D(f.currentLiabilities),
    totalLiabilities: D(f.totalLiabilities),
    shortTermDebt: D(f.shortTermDebt),
    longTermDebt: D(f.longTermDebt),
    totalDebt: null, // derived by the engine (short + long)
    totalEquity: D(f.totalEquity),
    operatingCashFlow: D(f.operatingCashFlow),
    investingCashFlow: D(f.investingCashFlow),
    financingCashFlow: D(f.financingCashFlow),
    capex: D(f.capex),
    annualDebtService: null, // approximated by the engine
  };
}

export const EMPTY_YEAR: YearFinancials = {
  fiscalYear: 2025,
  revenue: null, cogs: null, grossProfit: null, operatingIncome: null,
  netIncome: null, ebitda: null, depreciationAmortization: null,
  interestExpense: null, cash: null,
  receivables: null, inventory: null, currentAssets: null, totalAssets: null,
  currentLiabilities: null, totalLiabilities: null, shortTermDebt: null,
  longTermDebt: null, totalDebt: null, totalEquity: null,
  operatingCashFlow: null, investingCashFlow: null, financingCashFlow: null,
  capex: null, annualDebtService: null,
};
