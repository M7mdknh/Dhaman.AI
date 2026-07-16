/**
 * FinancialIntelligenceService — orchestrator. Maps persisted
 * FinancialStatement rows + ContractDetails into the engines' inputs and
 * assembles the FinancialIntelligenceReport. Contains NO formulas itself.
 *
 * Computed on demand from live rows (cheap pure functions, always current).
 * A frozen analysis snapshot arrives with the AI Underwriter sprint, which
 * needs an immutable input for the memo.
 */
import {
  assessContractRisk,
  detectContractCaps,
  detectContractRiskFlags,
} from "@/services/finance/contract-risk-service";
import { assessExecutionCapacity } from "@/services/finance/execution-capacity-service";
import {
  usableStatements,
  validateFinancialIntegrity,
} from "@/services/finance/financial-integrity-validator";
import { computeGrowth, computeRatios } from "@/services/finance/financial-ratio-service";
import { composeOverallGrade } from "@/services/finance/overall-grade-service";
import {
  assessQualitative,
  detectQualitativeCaps,
  detectQualitativeFlags,
} from "@/services/finance/qualitative-score-service";
import { detectCompanyMismatchFlags, detectRiskFlags } from "@/services/finance/risk-flag-service";
import { assessRisk } from "@/services/finance/risk-score-service";
import { computeTrends } from "@/services/finance/trend-analysis-service";

import type { StatementIdentity } from "@/services/finance/risk-flag-service";
import type {
  ContractInputs,
  FinancialIntelligenceReport,
  QualitativeInputs,
  YearFinancials,
} from "@/lib/finance/types";
import type {
  CaseQualitative,
  ContractDetails,
  FinancialStatement,
} from "@/generated/prisma/client";

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
    depreciationAmortization: expenseMagnitude(row.depreciationAmortization),
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

/** Maps the ContractDetails row into the engines' input shape. Structured
 * fields are null on cases predating the detailed wizard — each scoring
 * component excludes itself when its input is null. */
export function toContractInputs(contract: ContractDetails): ContractInputs {
  const num = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());
  return {
    contractValue: contract.contractValue,
    guaranteeAmount: contract.guaranteeAmount,
    beneficiaryType: contract.beneficiaryType,
    durationMonths: contractDurationMonths(contract),
    guaranteePercentage: num(contract.guaranteePercentage),
    sector: contract.sector,
    contractorRole: contract.contractorRole,
    backToBackPayment: contract.backToBackPayment,
    awardMethod: contract.awardMethod,
    priorContractsWithBeneficiary: contract.priorContractsWithBeneficiary,
    advancePaymentPct: num(contract.advancePaymentPct),
    billingCycle: contract.billingCycle,
    retentionPct: num(contract.retentionPct),
    paymentPeriodDays: contract.paymentPeriodDays,
    requiredBondPct: num(contract.requiredBondPct),
    onFirstDemand: contract.onFirstDemand,
    extendOrPay: contract.extendOrPay,
    ldRatePctPerWeek: num(contract.ldRatePctPerWeek),
    ldCapPct: num(contract.ldCapPct),
    mobilizationWeeks: contract.mobilizationWeeks,
    expectedGrossMarginPct: num(contract.expectedGrossMarginPct),
  };
}

/** Maps the CaseQualitative row (+ the company's registered sector, for the
 * deterministic scope check) into the engine's input shape. */
export function toQualitativeInputs(
  row: CaseQualitative,
  companySector: string | null,
): QualitativeInputs {
  return {
    crIssueDate: row.crIssueDate,
    crActivities: row.crActivities,
    contractorClassification: row.contractorClassification,
    partOfGroup: row.partOfGroup,
    gmExperienceYears: row.gmExperienceYears,
    ownershipChanged: row.ownershipChanged,
    nitaqatBand: row.nitaqatBand,
    ongoingLitigation: row.ongoingLitigation,
    projectsCompletedBand: row.projectsCompletedBand,
    largestProjectValue: row.largestProjectValue,
    hadProjectIssues: row.hadProjectIssues,
    guaranteeCalled: row.guaranteeCalled,
    sameTypeExperience: row.sameTypeExperience,
    runningProjectsCount: row.runningProjectsCount,
    backlogValue: row.backlogValue,
    outstandingGuarantees: row.outstandingGuarantees,
    equipmentPlan: row.equipmentPlan,
    heavyHiringNeeded: row.heavyHiringNeeded,
    conductIncidents: row.conductIncidents,
    auditorTier: row.auditorTier,
    fundingSource: row.fundingSource,
    companySector,
  };
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
  qualitativeRow?: CaseQualitative | null,
  companySector?: string | null,
): FinancialIntelligenceReport | null {
  if (statements.length === 0) return null;

  const integrity = validateFinancialIntegrity(statements);
  const validated = usableStatements(statements, integrity);
  if (validated.length === 0) return null;

  const years = validated
    .map(toYearFinancials)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
  const latest = years.at(-1)!;

  const contractInputs = contract ? toContractInputs(contract) : null;
  const qualitativeInputs = qualitativeRow
    ? toQualitativeInputs(qualitativeRow, companySector ?? null)
    : null;

  const flags = detectRiskFlags(years);
  // Documentary-identity flags are surfaced to the reader but kept OUT of
  // the score inputs: scores measure the financials; whether the financials
  // belong to the applicant is the officer's call, loudly flagged.
  const identityFlags = identity
    ? detectCompanyMismatchFlags(identity.caseCompanyName, identity.statementIdentities)
    : [];
  // KYC + contract-structure flags are likewise kept OUT of the financial
  // score's flag-penalty inputs — they already shape their own pillars;
  // feeding them back into the trend component would double-count them.
  const qualitativeFlags = qualitativeInputs
    ? detectQualitativeFlags(qualitativeInputs, contractInputs, latest)
    : [];
  const contractFlags = contractInputs
    ? detectContractRiskFlags(contractInputs, qualitativeInputs, latest)
    : [];

  // ---- The three deterministic pillars + hard caps → grade of record.
  const risk = assessRisk(years, flags, contractInputs);
  const qualitative = qualitativeInputs
    ? assessQualitative(qualitativeInputs, contractInputs, latest)
    : null;
  const contractRisk =
    contractInputs && (qualitativeInputs || hasStructuredFields(contractInputs))
      ? assessContractRisk(contractInputs, qualitativeInputs, latest)
      : null;
  const caps = [
    ...(qualitativeInputs ? detectQualitativeCaps(qualitativeInputs) : []),
    ...(contractInputs ? detectContractCaps(contractInputs, qualitativeInputs) : []),
  ];
  const overall = composeOverallGrade(
    risk,
    qualitative,
    contractRisk,
    caps,
    validated.map((s) => s.statementType),
  );

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
    flags: [...identityFlags, ...qualitativeFlags, ...contractFlags, ...flags],
    risk,
    capacity: contractInputs ? assessExecutionCapacity(latest, contractInputs) : null,
    qualitative,
    contractRisk,
    overall,
  };
}

/** True when the contract row carries any of the structured Step-3 fields —
 * legacy contracts (all nulls) must not produce an empty contract pillar. */
function hasStructuredFields(contract: ContractInputs): boolean {
  return (
    contract.contractorRole !== null ||
    contract.awardMethod !== null ||
    contract.advancePaymentPct !== null ||
    contract.onFirstDemand !== null ||
    contract.expectedGrossMarginPct !== null
  );
}
