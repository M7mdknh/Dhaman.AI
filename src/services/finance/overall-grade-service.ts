/**
 * OverallGradeService — composes the three deterministic pillars into the
 * grade of record:
 *
 *   overall = 50% financial (ratio engine)
 *           + 30% qualitative (KYC)
 *           + 20% contract risk (structure)
 *
 * then applies HARD CAPS to the recommendation. Absent pillars (cases
 * predating the detailed wizard) are excluded and the weights renormalized,
 * so a legacy case grades exactly as the financial engine alone did.
 *
 * Caps constrain the recommendation OF RECORD only — never any score, and
 * never to REJECT (rejection stays a band/human outcome). Statement
 * reliability (audited / reviewed / management) is reported as CONFIDENCE
 * beside the grade; it never moves the number (that would double-count the
 * auditor-tier component of the qualitative pillar).
 */
import { PILLARS, RECOMMENDATION_BY_BAND, RELIABILITY_CONFIDENCE } from "@/lib/finance/thresholds";
import { riskBandFor } from "@/services/finance/risk-score-service";

import type {
  GradeConfidence,
  HardCap,
  OverallGrade,
  PillarAssessment,
  RecommendationOfRecord,
  RiskAssessment,
  StatementReliability,
} from "@/lib/finance/types";

/** Less favorable = higher. Caps push the recommendation UP this ladder. */
const SEVERITY: Record<RecommendationOfRecord, number> = {
  APPROVE: 0,
  APPROVE_WITH_CONDITIONS: 1,
  MANUAL_REVIEW: 2,
  REJECT: 3,
};

function applyCaps(base: RecommendationOfRecord, caps: HardCap[]): RecommendationOfRecord {
  let result = base;
  for (const cap of caps) {
    if (SEVERITY[cap.ceiling] > SEVERITY[result]) result = cap.ceiling;
  }
  return result;
}

function confidenceFor(
  reliability: StatementReliability[],
): { confidence: GradeConfidence; detail: string } {
  if (reliability.length === 0) {
    return { confidence: "LOW", detail: "No parsed statements behind the financial pillar." };
  }
  // The WEAKEST statement in the analysis window bounds the confidence —
  // one management-accounts year contaminates a multi-year trend.
  const rank: Record<StatementReliability, number> = { AUDITED: 0, REVIEWED: 1, MANAGEMENT: 2 };
  const worst = reliability.reduce((a, b) => (rank[b] > rank[a] ? b : a));
  const counts = reliability.reduce<Record<string, number>>((acc, r) => {
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(counts).map(
    ([type, n]) => `${n} ${type.toLowerCase()}`,
  );
  return {
    confidence: RELIABILITY_CONFIDENCE[worst],
    detail: `Statement basis: ${parts.join(", ")}.`,
  };
}

export function composeOverallGrade(
  financial: RiskAssessment,
  qualitative: PillarAssessment | null,
  contractRisk: PillarAssessment | null,
  caps: HardCap[],
  reliability: StatementReliability[],
): OverallGrade {
  const { weights } = PILLARS;
  const pillars: OverallGrade["pillars"] = [
    {
      key: "financial",
      label: "Financial health",
      weight: weights.financial,
      score: financial.score,
      band: financial.band,
    },
    {
      key: "qualitative",
      label: "Company qualitative (KYC)",
      weight: weights.qualitative,
      score: qualitative?.score ?? null,
      band: qualitative?.band ?? null,
    },
    {
      key: "contractRisk",
      label: "Contract risk",
      weight: weights.contractRisk,
      score: contractRisk?.score ?? null,
      band: contractRisk?.band ?? null,
    },
  ];

  const available = pillars.filter((p) => p.score !== null);
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);
  const weighted = available.reduce((sum, p) => sum + p.score! * p.weight, 0);
  const score = totalWeight === 0 ? financial.score : Math.round(weighted / totalWeight);
  const band = riskBandFor(score);

  const uncapped = RECOMMENDATION_BY_BAND[band];
  const recommendation = applyCaps(uncapped, caps);
  const { confidence, detail } = confidenceFor(reliability);

  return {
    score,
    band,
    pillars,
    caps,
    recommendation,
    uncappedRecommendation: uncapped,
    confidence,
    confidenceDetail: detail,
  };
}
