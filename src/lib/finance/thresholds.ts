/**
 * EVERY tunable constant of the Financial Intelligence Engine lives here —
 * no magic numbers inside engine code. Each value is documented in
 * docs/FINANCIAL_ENGINE.md; approved 2026-07-06. Adjusting bank policy
 * means editing THIS file only.
 */

/** |YoY change| below this is reported as STABLE. */
export const TREND_STABILITY_BAND = 0.05;

/** Risk-flag trigger thresholds (fractions unless noted). */
export const FLAGS = {
  revenueDecline: { medium: -0.1, high: -0.2 },
  /** Rapid growth strains working capital (overtrading watch). */
  revenueSpike: { low: 0.4 },
  cashDeterioration: { medium: -0.3, high: -0.5 },
  debtSpike: { medium: 0.3, high: 0.6, /** ignore when debt < this share of assets */ materialityVsAssets: 0.1 },
  /** Receivables growth exceeding revenue growth by this many points. */
  receivableGrowthGapPp: 0.2,
  marginDeteriorationPp: { medium: 0.03, high: 0.06 },
  liquidity: { criticalCurrentRatio: 1.0, deteriorationDrop: 0.25 },
  equityErosion: { medium: -0.2 },
  /** Generic attention flag on very large moves of core figures. */
  largeSwing: 0.5,
} as const;

/**
 * Execution Capacity Score — component weights (sum = 100) and the linear
 * clamp ranges mapping a raw value to a 0–1 sub-score.
 * Missing components are excluded and the remaining weights renormalized;
 * the dashboard lists what was missing.
 */
export const CAPACITY = {
  weights: {
    liquidity: 12,
    leverage: 10,
    profitability: 10,
    cashFlow: 10,
    workingCapital: 8,
    contractVsRevenue: 18,
    contractVsAssets: 8,
    guaranteeVsEquity: 6,
    duration: 8,
    beneficiary: 10,
  },
  /** current ratio: ≤1.0 → 0, ≥2.0 → 1 */
  currentRatio: { floor: 1.0, ceil: 2.0 },
  /** debt-to-equity: ≥3.0 → 0, ≤1.0 → 1 (equity ≤ 0 scores 0) */
  debtToEquity: { floor: 3.0, ceil: 1.0 },
  /** net margin: ≤0 → 0, ≥8% → 1 */
  netMargin: { floor: 0, ceil: 0.08 },
  /** operating cash flow ratio: ≤0 → 0, ≥0.4 → 1 */
  ocfRatio: { floor: 0, ceil: 0.4 },
  /** working capital vs assumed mobilization need (10% of contract value). */
  mobilizationShareOfContract: 0.1,
  /** contract value / revenue: ≤0.5× → 1, ≥2.5× → 0 */
  contractVsRevenue: { ceil: 0.5, floor: 2.5 },
  /** contract value / total assets: ≤0.3× → 1, ≥1.5× → 0 */
  contractVsAssets: { ceil: 0.3, floor: 1.5 },
  /** guarantee / equity: ≤0.25× → 1, ≥1.0× → 0 */
  guaranteeVsEquity: { ceil: 0.25, floor: 1.0 },
  /** duration months: ≤12 → 1, ≥48 → 0.2 (long tail risk, never 0) */
  duration: { ceilMonths: 12, floorMonths: 48, floorScore: 0.2 },
  /** Payment-reliability proxy per beneficiary type. */
  beneficiaryScore: { GOVERNMENT: 0.8, PRIVATE: 0.5 },
  bands: { strong: 70, moderate: 45 },
} as const;

/**
 * Risk Score — component weights (sum = 100), clamp ranges mapping each raw
 * value to a 0–1 SAFETY sub-score (1 = safest), and the band boundaries.
 * The published score is (1 − weighted safety) × 100, so HIGHER = RISKIER.
 * Ported from the approved V1 blueprint (core/risk.py); missing components
 * are excluded and the remaining weights renormalized.
 */
export const RISK = {
  weights: {
    liquidity: 15,
    leverage: 15,
    profitability: 15,
    coverage: 20,
    trend: 15,
    contractExposure: 20,
  },
  /** current ratio: ≤1.0 → 0, ≥1.5 → 1 (comfortable at 1.5 per V1) */
  currentRatio: { floor: 1.0, ceil: 1.5 },
  /** debt-to-equity: ≥3.0 → 0, ≤1.0 → 1 (equity ≤ 0 scores 0) */
  debtToEquity: { floor: 3.0, ceil: 1.0 },
  /** net margin: ≤0 → 0, ≥8% → 1 */
  netMargin: { floor: 0, ceil: 0.08 },
  /** DSCR: ≤1.0 → 0, ≥1.5 → 1 (bankable at 1.5) */
  dscr: { floor: 1.0, ceil: 1.5 },
  /** Fallback when DSCR is incomputable (EBITDA not printed): interest coverage. */
  interestCoverageFallback: { floor: 1.0, ceil: 3.0 },
  /**
   * Trend health sub-score: base ± revenue direction (capped), minus a
   * penalty per detected risk flag. A single fiscal year cannot show a
   * trend → flat singleYear score.
   */
  trend: {
    base: 0.7,
    singleYear: 0.6,
    revenueCap: 0.2,
    flagPenalty: { HIGH: 0.2, MEDIUM: 0.1, LOW: 0 },
  },
  /**
   * Contract exposure sub-score: start at 1, subtract guarantee-vs-equity
   * and contract-vs-revenue stress, add the government-counterparty bonus.
   * Null when neither sizing ratio is computable — absence of data must
   * never read as safety.
   */
  exposure: {
    /** penalty ramps from `comfortable`× equity to max at `stressed`× */
    guaranteeVsEquity: { comfortable: 0.3, stressed: 1.0, maxPenalty: 0.6 },
    /** penalty per turn of revenue above `comfortable`×, capped */
    contractVsRevenue: { comfortable: 0.5, penaltyPerTurn: 0.3, maxPenalty: 0.3 },
    governmentBonus: 0.1,
  },
  /** Band lower bounds on the 0–100 risk score (higher = riskier). */
  bands: { low: 15, moderate: 35, high: 55, critical: 75 },
} as const;

/**
 * Bank policy: risk band → recommendation OF RECORD. Deterministic and
 * final — the AI must echo and explain this mapping, never choose it
 * (CLAUDE.md: the AI assists the bank, the AI never replaces the bank).
 */
export const RECOMMENDATION_BY_BAND = {
  EXCELLENT: "APPROVE",
  LOW: "APPROVE",
  MODERATE: "APPROVE_WITH_CONDITIONS",
  HIGH: "MANUAL_REVIEW",
  CRITICAL: "REJECT",
} as const;

/**
 * Review-queue priority (Sprint 5). Derived deterministically — never a
 * manually maintained field: risky bands and large exposures surface first.
 * Amounts are SAR.
 */
export const PRIORITY = {
  /** Risk bands that force HIGH priority regardless of size. */
  highRiskBands: ["HIGH", "CRITICAL"],
  /** Guarantee amount at/above which a case is HIGH priority. */
  guaranteeHigh: 10_000_000,
  /** Guarantee amount at/above which a case is at least NORMAL priority. */
  guaranteeNormal: 1_000_000,
} as const;

/** Ratio display rounding (decimal places). */
export const RATIO_PRECISION = 4;
