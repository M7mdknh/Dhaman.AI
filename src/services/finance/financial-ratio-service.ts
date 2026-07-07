/**
 * FinancialRatioService — point-in-time ratios per fiscal year plus YoY
 * growth. Pure and deterministic: Decimal in, numbers/strings out; no I/O,
 * no AI. Formulas are documented in docs/FINANCIAL_ENGINE.md.
 *
 * Documented derivations (only when the figure is not printed):
 *   grossProfit  := revenue − cogs
 *   totalDebt    := shortTermDebt + longTermDebt (present parts)
 *   debtService  := annualDebtService, else interestExpense + shortTermDebt
 *                   (interest + current maturities — standard approximation)
 * EBITDA is used only when printed — never estimated.
 */
import { growth, ratio, sub, sumPresent, toMoneyString } from "@/lib/finance/decimal";

import type {
  GrowthKey,
  GrowthPeriod,
  Money,
  RatioKey,
  YearFinancials,
  YearRatios,
} from "@/lib/finance/types";

export function derivedGrossProfit(y: YearFinancials): Money | null {
  return y.grossProfit ?? sub(y.revenue, y.cogs);
}

export function derivedTotalDebt(y: YearFinancials): Money | null {
  return y.totalDebt ?? sumPresent(y.shortTermDebt, y.longTermDebt);
}

export function derivedDebtService(y: YearFinancials): Money | null {
  return y.annualDebtService ?? sumPresent(y.interestExpense, y.shortTermDebt);
}

export function derivedWorkingCapital(y: YearFinancials): Money | null {
  return sub(y.currentAssets, y.currentLiabilities);
}

/** All ratios for one fiscal year. Incomputable ratios are null. */
export function computeYearRatios(y: YearFinancials): YearRatios {
  const grossProfit = derivedGrossProfit(y);
  const totalDebt = derivedTotalDebt(y);
  const debtService = derivedDebtService(y);
  const equityPositive = y.totalEquity != null && y.totalEquity.gt(0) ? y.totalEquity : null;

  const ratios: Record<RatioKey, number | null> = {
    // Liquidity
    currentRatio: ratio(y.currentAssets, y.currentLiabilities),
    quickRatio: ratio(sub(y.currentAssets, y.inventory), y.currentLiabilities),
    cashRatio: ratio(y.cash, y.currentLiabilities),
    // Leverage — equity-based ratios are meaningless on non-positive equity.
    debtRatio: ratio(y.totalLiabilities, y.totalAssets),
    debtToEquity: ratio(y.totalLiabilities, equityPositive),
    debtToAssets: ratio(totalDebt, y.totalAssets),
    interestCoverage: ratio(y.operatingIncome, y.interestExpense),
    // Profitability
    grossMargin: ratio(grossProfit, y.revenue),
    operatingMargin: ratio(y.operatingIncome, y.revenue),
    netMargin: ratio(y.netIncome, y.revenue),
    returnOnAssets: ratio(y.netIncome, y.totalAssets),
    returnOnEquity: ratio(y.netIncome, equityPositive),
    ebitdaMargin: ratio(y.ebitda, y.revenue),
    // Efficiency
    assetTurnover: ratio(y.revenue, y.totalAssets),
    inventoryTurnover: ratio(y.cogs, y.inventory),
    receivableTurnover: ratio(y.revenue, y.receivables),
    // Cash flow
    operatingCashFlowRatio: ratio(y.operatingCashFlow, y.currentLiabilities),
    // Coverage
    dscr: ratio(y.ebitda, debtService),
    ebitdaCoverage: ratio(y.ebitda, y.interestExpense),
  };

  return {
    fiscalYear: y.fiscalYear,
    ratios,
    workingCapital: toMoneyString(derivedWorkingCapital(y)),
    freeCashFlow: toMoneyString(sub(y.operatingCashFlow, y.capex)),
  };
}

/** Ratios for every year, ascending. Input may be in any order. */
export function computeRatios(years: YearFinancials[]): YearRatios[] {
  return [...years]
    .sort((a, b) => a.fiscalYear - b.fiscalYear)
    .map(computeYearRatios);
}

const GROWTH_SOURCES: Record<GrowthKey, (y: YearFinancials) => Money | null> = {
  revenueGrowth: (y) => y.revenue,
  assetGrowth: (y) => y.totalAssets,
  equityGrowth: (y) => y.totalEquity,
  cashGrowth: (y) => y.cash,
  netIncomeGrowth: (y) => y.netIncome,
};

/** YoY growth between each adjacent pair of years, ascending. */
export function computeGrowth(years: YearFinancials[]): GrowthPeriod[] {
  const sorted = [...years].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const periods: GrowthPeriod[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prior = sorted[i - 1];
    const current = sorted[i];
    const entries = Object.entries(GROWTH_SOURCES) as [GrowthKey, (y: YearFinancials) => Money | null][];
    periods.push({
      fromYear: prior.fiscalYear,
      toYear: current.fiscalYear,
      growth: Object.fromEntries(
        entries.map(([key, pick]) => [key, growth(pick(current), pick(prior))]),
      ) as Record<GrowthKey, number | null>,
    });
  }
  return periods;
}
