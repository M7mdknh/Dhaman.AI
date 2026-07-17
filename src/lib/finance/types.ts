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
  depreciationAmortization: Money | null;
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
  /** % of contract value the guarantee covers (0–100). */
  guaranteePercentage: number | null;
  /** Sector declared for the contract (scope check vs the company sector). */
  sector: string | null;
  // ---- Structured contract-risk inputs (null on cases predating the
  // detailed wizard — each component excludes itself when its input is null).
  contractorRole: "MAIN_CONTRACTOR" | "SUBCONTRACTOR" | null;
  backToBackPayment: boolean | null;
  awardMethod: "PUBLIC_TENDER" | "LIMITED_TENDER" | "DIRECT_AWARD" | null;
  priorContractsWithBeneficiary: number | null;
  advancePaymentPct: number | null;
  billingCycle: "MONTHLY" | "MILESTONE" | "OTHER" | null;
  retentionPct: number | null;
  paymentPeriodDays: number | null;
  requiredBondPct: number | null;
  onFirstDemand: boolean | null;
  extendOrPay: boolean | null;
  ldRatePctPerWeek: number | null;
  ldCapPct: number | null;
  mobilizationWeeks: number | null;
  expectedGrossMarginPct: number | null;
}

/**
 * KYC questionnaire answers feeding the qualitative pillar (wizard Step 2).
 * Mirrors CaseQualitative without a Prisma-client dependency in the engine.
 */
export interface QualitativeInputs {
  crIssueDate: Date;
  partOfGroup: boolean;
  ownershipChanged: boolean;
  nitaqatBand: "PLATINUM" | "GREEN" | "YELLOW" | "RED";
  ongoingLitigation: boolean;
  projectsCompletedBand: "UNDER_5" | "FROM_5_TO_10" | "FROM_10_TO_25" | "OVER_25";
  hadProjectIssues: boolean;
  guaranteeCalled: boolean;
  sameTypeExperience: boolean;
  runningProjectsCount: number;
  backlogValue: Money;
  outstandingGuarantees: Money;
  heavyHiringNeeded: boolean;
  conductIncidents: boolean;
  auditorTier: "BIG_FOUR" | "ACCREDITED_LOCAL" | "OTHER_FIRM" | "UNAUDITED";
  fundingSource: "OWN_CASH" | "THIS_BANK" | "OTHER_BANK" | "SUPPLIER_CREDIT";
  /** The company profile sector (scope check vs the contract sector). */
  companySector: string | null;
}

/** Statement reliability class (mirrors the Prisma enum for engine use). */
export type StatementReliability = "AUDITED" | "REVIEWED" | "MANAGEMENT";

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

/**
 * A non-dilutable policy override: certain declared answers must never be
 * averaged away by good ratios. A cap limits how favorable the
 * recommendation OF RECORD can be — it never changes any score.
 */
export interface HardCap {
  type: string;
  /** Most favorable recommendation this cap allows. */
  ceiling: "APPROVE_WITH_CONDITIONS" | "MANUAL_REVIEW";
  reason: string;
}

/** One pillar of the composite grade (same shape as RiskAssessment). */
export interface PillarAssessment {
  /** 0–100, HIGHER = RISKIER (matches the financial risk score). */
  score: number;
  band: RiskBand;
  components: ScoreComponent[];
  missingInputs: string[];
}

export type RecommendationOfRecord =
  | "APPROVE"
  | "APPROVE_WITH_CONDITIONS"
  | "MANUAL_REVIEW"
  | "REJECT";

/** How far the financial pillar can be trusted, from statement reliability. */
export type GradeConfidence = "HIGH" | "MEDIUM" | "LOW";

/**
 * The composite underwriting grade: financial (ratio engine) + qualitative
 * (KYC) + contract risk, weighted per PILLARS in thresholds.ts, then hard
 * caps applied to the recommendation. Pillars whose inputs are absent
 * (legacy cases) are excluded and the weights renormalized — a case with no
 * KYC data grades exactly as the financial engine alone did before.
 */
export interface OverallGrade {
  /** 0–100, HIGHER = RISKIER — weighted over available pillars. */
  score: number;
  band: RiskBand;
  pillars: {
    key: "financial" | "qualitative" | "contractRisk";
    label: string;
    weight: number;
    /** null = pillar unavailable (excluded + renormalized). */
    score: number | null;
    band: RiskBand | null;
  }[];
  caps: HardCap[];
  /** Deterministic bank policy AFTER caps — the recommendation of record. */
  recommendation: RecommendationOfRecord;
  /** What the band alone would have recommended (shown when a cap bites). */
  uncappedRecommendation: RecommendationOfRecord;
  /** Reliability of the statements behind the financial pillar. */
  confidence: GradeConfidence;
  confidenceDetail: string;
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
  /** Qualitative (KYC) pillar — null on cases predating the questionnaire. */
  qualitative: PillarAssessment | null;
  /** Contract-risk pillar — null without the structured contract fields. */
  contractRisk: PillarAssessment | null;
  /** The composite grade + recommendation of record (always computed). */
  overall: OverallGrade;
}
