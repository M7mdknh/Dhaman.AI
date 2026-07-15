/**
 * Financial Intelligence Engine — shared types. Money stays Decimal
 * (decimal strings at the UI boundary); dimensionless ratios/scores are
 * numbers. Everything is nullable: a missing input yields null, never NaN.
 */
import type { Prisma } from "@/generated/prisma/client";

export type Money = Prisma.Decimal;

/** One fiscal year of canonical figures (null = not in the statements). */
export interface YearFinancials {
  fiscalYear: number;
  revenue: Money | null;
  cogs: Money | null;
  grossProfit: Money | null;
  operatingIncome: Money | null;
  netIncome: Money | null;
  ebitda: Money | null;
  interestExpense: Money | null;
  cash: Money | null;
  receivables: Money | null;
  inventory: Money | null;
  currentAssets: Money | null;
  totalAssets: Money | null;
  currentLiabilities: Money | null;
  totalLiabilities: Money | null;
  shortTermDebt: Money | null;
  longTermDebt: Money | null;
  totalDebt: Money | null;
  totalEquity: Money | null;
  operatingCashFlow: Money | null;
  investingCashFlow: Money | null;
  financingCashFlow: Money | null;
  capex: Money | null;
  annualDebtService: Money | null;
}

export const RATIO_KEYS = [
  // Liquidity
  "currentRatio",
  "quickRatio",
  "cashRatio",
  // Leverage
  "debtRatio",
  "debtToEquity",
  "debtToAssets",
  "interestCoverage",
  // Profitability
  "grossMargin",
  "operatingMargin",
  "netMargin",
  "returnOnAssets",
  "returnOnEquity",
  "ebitdaMargin",
  // Efficiency
  "assetTurnover",
  "inventoryTurnover",
  "receivableTurnover",
  // Cash flow
  "operatingCashFlowRatio",
  // Coverage
  "dscr",
  "ebitdaCoverage",
] as const;

export type RatioKey = (typeof RATIO_KEYS)[number];

/** Point-in-time ratios for one fiscal year (null = incomputable). */
export interface YearRatios {
  fiscalYear: number;
  ratios: Record<RatioKey, number | null>;
  /** Money-denominated metrics (decimal strings). */
  workingCapital: string | null;
  freeCashFlow: string | null;
}

export const GROWTH_KEYS = [
  "revenueGrowth",
  "assetGrowth",
  "equityGrowth",
  "cashGrowth",
  "netIncomeGrowth",
] as const;

export type GrowthKey = (typeof GROWTH_KEYS)[number];

/** YoY growth between two adjacent fiscal years (null = prior ≤ 0 or missing). */
export interface GrowthPeriod {
  fromYear: number;
  toYear: number;
  growth: Record<GrowthKey, number | null>;
}

export type TrendDirection = "INCREASING" | "DECREASING" | "STABLE";

export interface TrendPoint {
  fiscalYear: number;
  /** Decimal string for money metrics; plain number for percentage metrics. */
  value: string | number | null;
}

export interface MetricTrend {
  key: string;
  label: string;
  /** "money" values are decimal strings; "percent" values are fractions. */
  unit: "money" | "percent";
  series: TrendPoint[]; // ascending fiscal years
  yoyChanges: { fromYear: number; toYear: number; changePct: number | null }[];
  direction: TrendDirection | null; // null with <2 usable points
}

export type FlagSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface FlagEvidence {
  label: string;
  fiscalYear: number;
  /** Display value: decimal string (money) or fraction (ratio/percent). */
  value: string;
}

export interface RiskFlag {
  type: string;
  severity: FlagSeverity;
  explanation: string;
  affectedYears: number[];
  evidence: FlagEvidence[];
}

/** Contract characteristics both composite-score engines size against. */
export interface ContractInputs {
  contractValue: Money;
  guaranteeAmount: Money;
  beneficiaryType: "GOVERNMENT" | "PRIVATE";
  /** Whole months between project start and end (null = dates missing). */
  durationMonths: number | null;
}

/** One weighted component of a composite score (capacity or risk). */
export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  /** 0–1 sub-score; null = input missing (weight excluded + renormalized). */
  score: number | null;
  detail: string;
}

export type CapacityBand = "STRONG" | "MODERATE" | "LIMITED";

export interface ExecutionCapacity {
  /** 0–100, weighted + renormalized over available components. */
  score: number;
  band: CapacityBand;
  components: ScoreComponent[];
  missingInputs: string[];
}

export type RiskBand = "EXCELLENT" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface RiskAssessment {
  /** 0–100, HIGHER = RISKIER: (1 − weighted safety) × 100, renormalized. */
  score: number;
  band: RiskBand;
  /** Safety sub-scores (1 = safest) behind the score — full transparency. */
  components: ScoreComponent[];
  missingInputs: string[];
}

/** What the parsed statements disclose — drives honest "not disclosed" UI. */
export interface DisclosureNotes {
  /**
   * True when a balance sheet was parsed but carries NO current/non-current
   * split — it is presented in order of liquidity, the standard format for
   * banks and finance companies. Liquidity, OCF-ratio, and working-capital
   * metrics are then "not disclosed by this statement", not "missing data".
   */
  orderOfLiquidity: boolean;
}

export interface FinancialIntelligenceReport {
  /** Fiscal years with data, ascending. */
  years: number[];
  latestYear: number;
  currency: string;
  disclosures: DisclosureNotes;
  ratiosByYear: YearRatios[]; // ascending
  growthPeriods: GrowthPeriod[]; // ascending pairs
  trends: MetricTrend[];
  flags: RiskFlag[];
  /** Always computed; contract exposure is excluded without contract details. */
  risk: RiskAssessment;
  capacity: ExecutionCapacity | null; // null without contract details
}
