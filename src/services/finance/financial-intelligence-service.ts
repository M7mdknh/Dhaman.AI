/**
 * FinancialIntelligenceService — orchestrator. Maps persisted
 * FinancialStatement rows + ContractDetails into the engines' inputs and
 * assembles the FinancialIntelligenceReport. Contains NO formulas itself.
 *
 * Computed on demand from live rows (cheap pure functions, always current).
 * A frozen analysis snapshot arrives with the AI Underwriter sprint, which
 * needs an immutable input for the memo.
 */
import { assessExecutionCapacity } from "@/services/finance/execution-capacity-service";
import { computeGrowth, computeRatios } from "@/services/finance/financial-ratio-service";
import { detectRiskFlags } from "@/services/finance/risk-flag-service";
import { assessRisk } from "@/services/finance/risk-score-service";
import { computeTrends } from "@/services/finance/trend-analysis-service";

import type { FinancialIntelligenceReport, YearFinancials } from "@/lib/finance/types";
import type { ContractDetails, FinancialStatement } from "@/generated/prisma/client";

const AVG_DAYS_PER_MONTH = 30.44;

/**
 * Sign convention: statements print pure-expense lines (COGS, finance costs,
 * capex, debt service) as outflows "(84,000,000)" and the parser preserves
 * that sign. The engines treat these four as MAGNITUDES, so they are
 * normalized with abs() here — and only these four: signs on net income,
 * cash flows, and equity are meaningful and untouched.
 */
function expenseMagnitude(value: FinancialStatement["cogs"]): FinancialStatement["cogs"] {
  return value === null ? null : value.abs();
}

export function toYearFinancials(row: FinancialStatement): YearFinancials {
  return {
    fiscalYear: row.fiscalYear,
    revenue: row.revenue,
    cogs: expenseMagnitude(row.cogs),
    grossProfit: row.grossProfit,
    operatingIncome: row.operatingIncome,
    netIncome: row.netIncome,
    ebitda: row.ebitda,
    interestExpense: expenseMagnitude(row.interestExpense),
    cash: row.cash,
    receivables: row.receivables,
    inventory: row.inventory,
    currentAssets: row.currentAssets,
    totalAssets: row.totalAssets,
    currentLiabilities: row.currentLiabilities,
    totalLiabilities: row.totalLiabilities,
    shortTermDebt: row.shortTermDebt,
    longTermDebt: row.longTermDebt,
    totalDebt: row.totalDebt,
    totalEquity: row.totalEquity,
    operatingCashFlow: row.operatingCashFlow,
    investingCashFlow: row.investingCashFlow,
    financingCashFlow: row.financingCashFlow,
    capex: expenseMagnitude(row.capex),
    annualDebtService: expenseMagnitude(row.annualDebtService),
  };
}

export function contractDurationMonths(contract: ContractDetails): number | null {
  const ms = contract.projectEndDate.getTime() - contract.projectStartDate.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / (AVG_DAYS_PER_MONTH * 24 * 60 * 60 * 1000)));
}

/**
 * Builds the full report. Returns null when no parsed statements exist —
 * the analysis page shows its "no data" state instead.
 */
export function buildFinancialIntelligence(
  statements: FinancialStatement[],
  contract: ContractDetails | null,
): FinancialIntelligenceReport | null {
  if (statements.length === 0) return null;

  const years = statements
    .map(toYearFinancials)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
  const latest = years.at(-1)!;

  const contractInputs = contract
    ? {
        contractValue: contract.contractValue,
        guaranteeAmount: contract.guaranteeAmount,
        beneficiaryType: contract.beneficiaryType,
        durationMonths: contractDurationMonths(contract),
      }
    : null;
  const flags = detectRiskFlags(years);

  return {
    years: years.map((y) => y.fiscalYear),
    latestYear: latest.fiscalYear,
    currency: statements[0].currency,
    ratiosByYear: computeRatios(years),
    growthPeriods: computeGrowth(years),
    trends: computeTrends(years),
    flags,
    risk: assessRisk(years, flags, contractInputs),
    capacity: contractInputs ? assessExecutionCapacity(latest, contractInputs) : null,
  };
}
