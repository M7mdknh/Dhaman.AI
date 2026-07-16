/**
 * The Stage-1 "underwriting headline" — the handful of figures that make a user
 * feel the analysis is DONE the instant the deterministic engine finishes, long
 * before the AI memo. Pure and cheap: derived entirely from the deterministic
 * FinancialIntelligenceReport (no AI, no I/O). Rendered by the processing
 * dashboard the moment Stage 1 completes.
 */
import type {
  CapacityBand,
  FinancialIntelligenceReport,
  RiskBand,
} from "@/lib/finance/types";
import type { RecommendationType } from "@/generated/prisma/client";

export interface UnderwritingHeadline {
  /** Underwriting Capacity, 0-100 (null without contract details). */
  capacityScore: number | null;
  capacityBand: CapacityBand | null;
  /** Credit-style letter rating derived from the risk score (AAA…CCC). */
  rating: string;
  /** Financial Health, 0-100 = inverse of the risk score. */
  healthScore: number;
  /** Risk score, 0-100 (higher = riskier). */
  riskScore: number;
  riskBand: RiskBand;
  /** Deterministic bank-policy recommendation (NOT the AI's). */
  recommendation: RecommendationType;
}

/**
 * Letter rating from the 0-100 risk score (0 = safest). Buckets are chosen to
 * read like an investment-grade scale for the demo; the underlying risk band
 * remains the source of truth for policy.
 */
export function deriveRating(riskScore: number): string {
  if (riskScore < 8) return "AAA";
  if (riskScore < 16) return "AA";
  if (riskScore < 28) return "A";
  if (riskScore < 42) return "BBB";
  if (riskScore < 58) return "BB";
  if (riskScore < 75) return "B";
  return "CCC";
}

export function deriveHeadline(report: FinancialIntelligenceReport): UnderwritingHeadline {
  // The composite grade (financial + qualitative + contract pillars, hard
  // caps applied) — renormalizes to the financial score alone on pre-KYC
  // cases, so legacy headlines are unchanged.
  const riskScore = Math.round(report.overall.score);
  return {
    capacityScore: report.capacity ? Math.round(report.capacity.score) : null,
    capacityBand: report.capacity?.band ?? null,
    rating: deriveRating(report.overall.score),
    healthScore: Math.max(0, Math.min(100, Math.round(100 - report.overall.score))),
    riskScore,
    riskBand: report.overall.band,
    recommendation: report.overall.recommendation,
  };
}
