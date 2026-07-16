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
 * Qualitative (KYC) pillar — component weights (sum = 100) and the band →
 * 0–1 safety sub-scores. Ordering logic (approved 2026-07-16):
 * computed factors beat declared ones, binary capability proofs weigh
 * heavy, and killer signals are HARD CAPS (see HARD_CAPS), never points —
 * a points-only system would let a called guarantee be averaged away.
 */
export const QUALITATIVE = {
  weights: {
    /** Survival is the strongest single contractor-default predictor. */
    operatingAge: 15,
    /** Track depth; diminishing returns above 25 completed projects. */
    projectsCompleted: 10,
    /** Execution risk is discipline-specific — binary proof of capability. */
    sameTypeExperience: 10,
    /** Who actually runs delivery. */
    gmExperience: 6,
    /** A recent change invalidates the track record earned before it. */
    managementStability: 4,
    /** RED freezes visas → labor-dependent projects stall (also a cap). */
    nitaqat: 10,
    /** Computed: (backlog + this contract) / latest revenue. */
    capacityHeadroom: 15,
    /** Rent/purchase stacks capex onto mobilization cash needs. */
    equipment: 5,
    /** Mobilization staffing risk. */
    hiring: 5,
    /** Clean declared conduct; any incident zeroes it AND hard-caps. */
    conduct: 10,
    /** Trust in the numbers every ratio is computed from. */
    auditor: 10,
  },
  /** Operating age (years since CR issuance): ≥10 → 1, linear to 0 at 2
   * (banks' own 2–3-year minimum sits at the floor). */
  operatingAge: { floorYears: 2, ceilYears: 10 },
  projectsCompleted: { OVER_25: 1, FROM_10_TO_25: 0.7, FROM_5_TO_10: 0.4, UNDER_5: 0.1 },
  /** GM years in this field: ≥10 → 1, linear to 0.15 at 0 (never negative). */
  gmExperience: { floorYears: 0, ceilYears: 10, floorScore: 0.15 },
  nitaqat: { PLATINUM: 1, GREEN: 0.7, YELLOW: 0.3, RED: 0 },
  /** (backlog + contract) / revenue: ≤1.5× → 1, ≥4× → 0. An over-committed
   * contractor delays everything at once. */
  capacityHeadroom: { ceil: 1.5, floor: 4.0 },
  equipment: { OWNED: 1, RENT: 0.6, PURCHASE: 0.2 },
  bands: { low: 15, moderate: 35, high: 55, critical: 75 },
} as const;

/**
 * Contract-risk pillar — component weights (sum = 100) and sub-score
 * mappings. Higher published score = riskier (matches the risk engine).
 */
export const CONTRACT_RISK = {
  weights: {
    /** Contract / largest completed project — the classic failure mode. */
    jumpRisk: 20,
    /** Back-to-back subcontracting = paid only if someone we did not
     * underwrite performs. */
    role: 12,
    /** Repeat awards prove performance AND the beneficiary's payment
     * behavior. */
    beneficiaryHistory: 10,
    /** Advance coverage of the pre-revenue burn window — the real driver
     * of mid-project distress. */
    cashGap: 18,
    /** Thin margin leaves nothing for delay or cost inflation. */
    marginBuffer: 12,
    /** Declared margin must survive contact with audited history. */
    marginRealism: 8,
    /** Public tenders are won on price. */
    awardMethod: 6,
    /** Extend-or-pay lets the beneficiary hold the bond hostage. */
    bondTerms: 9,
    /** LD cap bounds the worst-case call size. */
    ldExposure: 5,
  },
  /** contract / largest completed: ≤1× → 1, ≥3× → 0 (>3× also hard-caps). */
  jumpRatio: { ceil: 1.0, floor: 3.0 },
  role: { main: 1, subBackToBack: 0.17, subDirect: 0.58 },
  /** Prior contracts with this beneficiary: ≥3 → 1, 1–2 → 0.7, none → 0.3. */
  beneficiaryHistory: { repeat: 3, repeatScore: 1, someScore: 0.7, noneScore: 0.3 },
  /**
   * Cash-gap coverage = advance% × durationMonths / (100 × burn months),
   * i.e. the advance measured against the contract share consumed before
   * the first payment lands (linear spend assumption). ≥1 → fully covered.
   */
  cashGap: {
    billingCycleMonths: { MONTHLY: 1, MILESTONE: 3, OTHER: 2 },
    fullCoverage: 1.0,
    /** Coverage below this raises the CASH_GAP flag (pair with financing). */
    flagBelow: 0.5,
  },
  /** Expected gross margin %: ≥20 → 1, ≤10 → 0 (<10% also flags). */
  marginBuffer: { floorPct: 10, ceilPct: 20 },
  /** Declared / historical gross margin: ≤1.25× history → 1, ≥2× → 0. */
  marginRealism: { ceil: 1.25, floor: 2.0, /** flag above this multiple */ flagAbove: 1.5 },
  awardMethod: { LIMITED_TENDER: 1, DIRECT_AWARD: 0.83, PUBLIC_TENDER: 0.5 },
  bondTerms: { conditional: 1, firstDemand: 0.56, firstDemandExtendOrPay: 0.11 },
  /** LD cap %: ≤10 → 1, ≥25 → 0. No-LD contracts score 1. */
  ldExposure: { ceilPct: 10, floorPct: 25 },
  bands: { low: 15, moderate: 35, high: 55, critical: 75 },
} as const;

/**
 * Non-dilutable policy overrides. A triggered cap limits how favorable the
 * recommendation OF RECORD can be — it never changes any score, and it can
 * never force a REJECT (that stays a human/band outcome).
 */
export const HARD_CAPS = {
  /** Direct evidence the exact risk being priced has materialized before. */
  guaranteeCalled: { ceiling: "MANUAL_REVIEW" },
  /** Payment conduct is the product's core risk. */
  conductIncidents: { ceiling: "MANUAL_REVIEW" },
  /** Visa freeze can stall any labor-dependent project mid-execution. */
  nitaqatRed: { ceiling: "MANUAL_REVIEW" },
  /** Execution capability unproven at this scale, whatever the ratios say. */
  jumpRisk: { triggerRatio: 3.0, ceiling: "APPROVE_WITH_CONDITIONS" },
} as const;

/**
 * Composite grade: pillar weights (sum = 100). Financials carry half —
 * they are the only VERIFIED input (no SIMAH / open banking in this
 * phase). Company outweighs contract because the company repays across
 * every contract. Absent pillars (legacy cases) are excluded and the
 * remaining weights renormalized.
 */
export const PILLARS = {
  weights: { financial: 50, qualitative: 30, contractRisk: 20 },
  bands: { low: 15, moderate: 35, high: 55, critical: 75 },
} as const;

/**
 * Statement reliability → confidence in the financial pillar. Uncertainty
 * must never move a score (that would double-count the auditor-tier
 * component) — it is reported alongside the grade for the officer.
 */
export const RELIABILITY_CONFIDENCE = {
  AUDITED: "HIGH",
  REVIEWED: "MEDIUM",
  MANAGEMENT: "LOW",
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

/**
 * Financial Integrity Validator — the gate between extraction and the
 * engine. These bounds separate "this company is in trouble" (valid data the
 * engine must assess) from "these numbers cannot be what the auditor printed"
 * (mis-parsed data the engine must never see). Deliberately generous: wrongly
 * rejecting a real applicant is worse than passing an odd-looking one, and
 * every bound here is a statement about ARITHMETIC, never about health.
 */
export const INTEGRITY = {
  /**
   * |assets − (liabilities + equity)| as a share of total assets. Audited
   * statements balance exactly; this only absorbs rounding and presentation
   * (e.g. figures printed in thousands).
   */
  balanceTolerance: 0.01,
  /**
   * Consecutive-year change in total assets beyond this multiple means one
   * year was read at the wrong scale (units vs thousands) — no real balance
   * sheet moves 100x in a year.
   */
  scaleJumpFactor: 100,
  /**
   * |net income| beyond this multiple of revenue implies a mis-mapped label
   * rather than a real result. Generous: investment income and one-off
   * write-downs genuinely dwarf revenue in real statements.
   */
  netIncomeToRevenueMax: 10,
  /**
   * A current ratio beyond this is not a liquidity position — it means
   * current liabilities were mis-read (typically a near-zero denominator).
   */
  currentRatioMax: 1_000,
} as const;
