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
import {
  usableStatements,
  validateFinancialIntegrity,
} from "@/services/finance/financial-integrity-validator";
import { computeGrowth, computeRatios } from "@/services/finance/financial-ratio-service";
import { detectCompanyMismatchFlags, detectRiskFlags } from "@/services/finance/risk-flag-service";
import { assessRisk } from "@/services/finance/risk-score-service";
import { computeTrends } from "@/services/finance/trend-analysis-service";

import type { StatementIdentity } from "@/services/finance/risk-flag-service";
import type { FinancialIntelligenceReport, YearFinancials } from "@/lib/finance/types";
import type { ContractDetails, FinancialStatement } from "@/generated/prisma/client";

/**
 * Who the case says the applicant is vs. who the uploaded statements say
 * they are (parser-extracted). Optional — callers without extraction data
 * simply skip the documentary-identity check.
 */
export interface IdentityInputs {
  caseCompanyName: string;
  statementIdentities: StatementIdentity[];
}

/** Maps a case's documents (+parser extraction) into IdentityInputs. */
export function toIdentityInputs(
  caseCompanyName: string,
  documents: { fiscalYear: number | null; extraction: { companyName: string | null } | null }[],
): IdentityInputs {
  return {
    caseCompanyName,
    statementIdentities: documents.map((d) => ({
      companyName: d.extraction?.companyName ?? null,
      fiscalYear: d.fiscalYear,
    })),
  };
}

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
 *
 * INTEGRITY GATE: every fiscal year is validated here before a single ratio
 * is computed, and years that cannot be what the auditor printed are dropped.
 * The gate lives at the engine's own door on purpose — this function has many
 * callers (the pipeline, the review desk, the analysis page, the memo
 * builder), and a check placed in any one of them would leave the others
 * computing on impossible figures. Returning null when nothing survives keeps
 * the existing contract: every caller already handles the no-data case.
 */
export function buildFinancialIntelligence(
  statements: FinancialStatement[],
  contract: ContractDetails | null,
  identity?: IdentityInputs | null,
): FinancialIntelligenceReport | null {
  if (statements.length === 0) return null;

  const integrity = validateFinancialIntegrity(statements);
  const validated = usableStatements(statements, integrity);
  if (validated.length === 0) return null;

  const years = validated
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
  // Documentary-identity flags are surfaced to the reader but kept OUT of
  // the score inputs: scores measure the financials; whether the financials
  // belong to the applicant is the officer's call, loudly flagged.
  const identityFlags = identity
    ? detectCompanyMismatchFlags(identity.caseCompanyName, identity.statementIdentities)
    : [];

  // A parsed balance sheet with no current/non-current split anywhere is an
  // order-of-liquidity presentation (banks / finance companies) — the current
  // ratios are not published by the statement, which the UI says verbatim.
  const balanceSheetParsed = years.some((y) => y.totalAssets !== null);
  const currentSplitPrinted = years.some(
    (y) => y.currentAssets !== null || y.currentLiabilities !== null,
  );

  return {
    years: years.map((y) => y.fiscalYear),
    latestYear: latest.fiscalYear,
    currency: validated[0].currency,
    disclosures: { orderOfLiquidity: balanceSheetParsed && !currentSplitPrinted },
    ratiosByYear: computeRatios(years),
    growthPeriods: computeGrowth(years),
    trends: computeTrends(years),
    flags: [...identityFlags, ...flags],
    risk: assessRisk(years, flags, contractInputs),
    capacity: contractInputs ? assessExecutionCapacity(latest, contractInputs) : null,
  };
}
