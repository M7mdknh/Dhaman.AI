/**
 * RiskScoreService — deterministic credit risk scoring, ported from the
 * approved V1 blueprint (core/risk.py). Six weighted components across three
 * underwriting pillars:
 *
 *   1. Financial health   — liquidity, leverage, profitability, coverage
 *   2. Financial trend    — revenue direction + detected risk-flag burden
 *   3. Contract exposure  — guarantee/contract sizing vs the company's scale
 *
 * Each component maps to a 0–1 SAFETY sub-score by linear clamp; the
 * published score is (1 − weighted safety) × 100, so HIGHER = RISKIER.
 * A component with missing inputs is EXCLUDED and the remaining weights
 * renormalized — absence of data is reported, never scored (in either
 * direction). Full algorithm + worked examples: docs/FINANCIAL_ENGINE.md.
 * All weights, clamps, and band boundaries: lib/finance/thresholds.ts.
 *
 * No ML, no LLM — the same statements and contract always produce the same
 * score.
 */
import { clampScore, growth, ratio } from "@/lib/finance/decimal";
import { RISK } from "@/lib/finance/thresholds";
import { computeYearRatios } from "@/services/finance/financial-ratio-service";

import type {
  ContractInputs,
  RiskAssessment,
  RiskBand,
  RiskFlag,
  ScoreComponent,
  YearFinancials,
} from "@/lib/finance/types";

const fmt = (n: number, dp = 2) => n.toFixed(dp);

/** Band for a 0–100 risk score (boundaries are lower bounds, configurable). */
export function riskBandFor(score: number): RiskBand {
  const { bands } = RISK;
  if (score >= bands.critical) return "CRITICAL";
  if (score >= bands.high) return "HIGH";
  if (score >= bands.moderate) return "MODERATE";
  if (score >= bands.low) return "LOW";
  return "EXCELLENT";
}

/**
 * Trend health: base 0.7, plus the latest revenue YoY direction (capped at
 * ±revenueCap), minus a penalty per detected flag (the flag burden). With a
 * single fiscal year no trend is visible → flat neutral score. Null when
 * two+ years exist but neither a revenue change nor any flag is available.
 */
function trendComponent(sorted: YearFinancials[], flags: RiskFlag[]): ScoreComponent {
  const { trend, weights } = RISK;
  const base = {
    key: "trend",
    label: "Financial trend",
    weight: weights.trend,
  };

  if (sorted.length < 2) {
    return {
      ...base,
      score: trend.singleYear,
      detail: "Single fiscal year — no year-over-year trend visible (neutral)",
    };
  }

  const latest = sorted.at(-1)!;
  const prior = sorted.at(-2)!;
  const revenueChange = growth(latest.revenue, prior.revenue);
  if (revenueChange === null && flags.length === 0) {
    return { ...base, score: null, detail: "No year-over-year figures available" };
  }

  const revenueContribution =
    revenueChange === null
      ? 0
      : Math.max(-trend.revenueCap, Math.min(trend.revenueCap, revenueChange));
  const penalty = flags.reduce((sum, f) => sum + trend.flagPenalty[f.severity], 0);
  const score = Math.max(0, Math.min(1, trend.base + revenueContribution - penalty));

  const highs = flags.filter((f) => f.severity === "HIGH").length;
  const mediums = flags.filter((f) => f.severity === "MEDIUM").length;
  return {
    ...base,
    score,
    detail: `Revenue ${revenueChange === null ? "change n/a" : `${fmt(revenueChange * 100, 1)}% YoY`} · ${highs} high / ${mediums} medium flags`,
  };
}

/**
 * Contract exposure: start at 1 (small, well-covered guarantee), subtract
 * guarantee-vs-equity and contract-vs-revenue stress, add the government
 * counterparty bonus. Non-positive equity is a real signal → full
 * guarantee-vs-equity penalty. Null when the contract is missing or neither
 * sizing ratio is computable.
 */
function exposureComponent(
  latest: YearFinancials,
  contract: ContractInputs | null,
): ScoreComponent {
  const { exposure, weights } = RISK;
  const base = {
    key: "contractExposure",
    label: "Contract exposure",
    weight: weights.contractExposure,
  };

  if (contract === null) {
    return { ...base, score: null, detail: "Contract details not available" };
  }

  const equityNonPositive = latest.totalEquity !== null && latest.totalEquity.lte(0);
  const guaranteeVsEquity = equityNonPositive
    ? null
    : ratio(contract.guaranteeAmount, latest.totalEquity);
  const contractVsRevenue = ratio(contract.contractValue, latest.revenue);

  if (!equityNonPositive && guaranteeVsEquity === null && contractVsRevenue === null) {
    return { ...base, score: null, detail: "Equity and revenue unavailable — cannot size the exposure" };
  }

  const g2e = exposure.guaranteeVsEquity;
  const guaranteePenalty = equityNonPositive
    ? g2e.maxPenalty
    : guaranteeVsEquity === null
      ? 0
      : g2e.maxPenalty *
        clampScore(guaranteeVsEquity, g2e.comfortable, g2e.stressed);

  const c2r = exposure.contractVsRevenue;
  const contractPenalty =
    contractVsRevenue === null
      ? 0
      : Math.min(
          c2r.maxPenalty,
          Math.max(0, (contractVsRevenue - c2r.comfortable) * c2r.penaltyPerTurn),
        );

  const bonus = contract.beneficiaryType === "GOVERNMENT" ? exposure.governmentBonus : 0;
  const score = Math.max(0, Math.min(1, 1 - guaranteePenalty - contractPenalty + bonus));

  const parts = [
    equityNonPositive
      ? "equity non-positive"
      : guaranteeVsEquity !== null
        ? `guarantee ${fmt(guaranteeVsEquity)}× equity`
        : null,
    contractVsRevenue !== null ? `contract ${fmt(contractVsRevenue)}× revenue` : null,
    contract.beneficiaryType === "GOVERNMENT" ? "government counterparty" : null,
  ].filter(Boolean);
  return { ...base, score, detail: parts.join(" · ") };
}

export function assessRisk(
  years: YearFinancials[],
  flags: RiskFlag[],
  contract: ContractInputs | null,
): RiskAssessment {
  const { weights } = RISK;
  const sorted = [...years].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const latest = sorted.at(-1)!;
  const ratios = computeYearRatios(latest).ratios;

  const components: ScoreComponent[] = [];

  const cr = ratios.currentRatio;
  components.push({
    key: "liquidity",
    label: "Liquidity (current ratio)",
    weight: weights.liquidity,
    score: cr === null ? null : clampScore(cr, RISK.currentRatio.floor, RISK.currentRatio.ceil),
    detail: cr === null ? "Current ratio unavailable" : `Current ratio ${fmt(cr)}`,
  });

  // Non-positive equity is a real signal (not missing data): leverage scores 0.
  const equityNonPositive = latest.totalEquity !== null && latest.totalEquity.lte(0);
  const de = ratios.debtToEquity;
  components.push({
    key: "leverage",
    label: "Leverage (debt-to-equity)",
    weight: weights.leverage,
    score: equityNonPositive
      ? 0
      : de === null
        ? null
        : clampScore(de, RISK.debtToEquity.floor, RISK.debtToEquity.ceil),
    detail: equityNonPositive
      ? "Equity is non-positive"
      : de === null
        ? "Debt-to-equity unavailable"
        : `Debt-to-equity ${fmt(de)}`,
  });

  const nm = ratios.netMargin;
  components.push({
    key: "profitability",
    label: "Profitability (net margin)",
    weight: weights.profitability,
    score: nm === null ? null : clampScore(nm, RISK.netMargin.floor, RISK.netMargin.ceil),
    detail: nm === null ? "Net margin unavailable" : `Net margin ${fmt(nm * 100, 1)}%`,
  });

  // DSCR needs printed EBITDA; interest coverage is the standard fallback.
  const dscr = ratios.dscr;
  const ic = ratios.interestCoverage;
  components.push({
    key: "coverage",
    label: "Debt service coverage",
    weight: weights.coverage,
    score:
      dscr !== null
        ? clampScore(dscr, RISK.dscr.floor, RISK.dscr.ceil)
        : ic !== null
          ? clampScore(ic, RISK.interestCoverageFallback.floor, RISK.interestCoverageFallback.ceil)
          : null,
    detail:
      dscr !== null
        ? `DSCR ${fmt(dscr)}`
        : ic !== null
          ? `Interest coverage ${fmt(ic)} (DSCR unavailable)`
          : "Neither DSCR nor interest coverage computable",
  });

  components.push(trendComponent(sorted, flags));
  components.push(exposureComponent(latest, contract));

  // Weighted safety over available components, renormalized; risk = inverse.
  const available = components.filter((c) => c.score !== null);
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
  const weighted = available.reduce((sum, c) => sum + c.score! * c.weight, 0);
  const safety = totalWeight === 0 ? 0 : weighted / totalWeight;
  const score = Math.round((1 - safety) * 100);

  return {
    score,
    band: riskBandFor(score),
    components,
    missingInputs: components.filter((c) => c.score === null).map((c) => c.label),
  };
}
