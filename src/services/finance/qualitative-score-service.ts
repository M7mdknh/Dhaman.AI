/**
 * QualitativeScoreService — deterministic scoring of the KYC questionnaire
 * (the qualitative pillar of the composite grade). Nine weighted
 * components; each maps an answer (or a COMPUTED ratio — computed factors
 * can't be gamed by band-picking) to a 0–1 SAFETY sub-score. The published
 * score is (1 − weighted safety) × 100, so HIGHER = RISKIER, matching the
 * financial risk engine. Missing inputs are excluded and the weights
 * renormalized — absence of data is reported, never scored.
 *
 * Killer signals (guarantee called, conduct incidents, Nitaqat RED) also
 * emit HARD CAPS on the recommendation of record — points alone would let
 * good ratios average them away. Weights and mappings live in
 * lib/finance/thresholds.ts (QUALITATIVE, HARD_CAPS) only.
 *
 * No ML, no LLM — the same answers always produce the same score.
 */
import { add, clampScore, ratio } from "@/lib/finance/decimal";
import { HARD_CAPS, QUALITATIVE } from "@/lib/finance/thresholds";
import { riskBandFor } from "@/services/finance/risk-score-service";

import type {
  ContractInputs,
  HardCap,
  PillarAssessment,
  QualitativeInputs,
  RiskFlag,
  ScoreComponent,
  YearFinancials,
} from "@/lib/finance/types";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Whole years between the CR issuance date and now (floored at 0). */
export function operatingAgeYears(crIssueDate: Date, asOf: Date = new Date()): number {
  return Math.max(0, (asOf.getTime() - crIssueDate.getTime()) / MS_PER_YEAR);
}

/**
 * Capacity headroom ratio: (declared backlog + this contract) / latest
 * revenue. Null when revenue is missing or non-positive.
 */
export function capacityHeadroomRatio(
  q: QualitativeInputs,
  contract: ContractInputs | null,
  latest: YearFinancials | null,
): number | null {
  if (!latest?.revenue || latest.revenue.lte(0)) return null;
  const committed = contract
    ? add(q.backlogValue, contract.contractValue)
    : q.backlogValue;
  return ratio(committed, latest.revenue);
}

export function assessQualitative(
  q: QualitativeInputs,
  contract: ContractInputs | null,
  latest: YearFinancials | null,
): PillarAssessment {
  const { weights } = QUALITATIVE;
  const components: ScoreComponent[] = [];

  const age = operatingAgeYears(q.crIssueDate);
  components.push({
    key: "operatingAge",
    label: "Operating history",
    weight: weights.operatingAge,
    score: clampScore(age, QUALITATIVE.operatingAge.floorYears, QUALITATIVE.operatingAge.ceilYears),
    detail: `${age.toFixed(1)} years since CR issuance`,
  });

  components.push({
    key: "projectsCompleted",
    label: "Track record depth",
    weight: weights.projectsCompleted,
    score: QUALITATIVE.projectsCompleted[q.projectsCompletedBand],
    detail: `Completed projects band: ${q.projectsCompletedBand.replaceAll("_", " ").toLowerCase()}`,
  });

  components.push({
    key: "sameTypeExperience",
    label: "Experience with this work type",
    weight: weights.sameTypeExperience,
    score: q.sameTypeExperience ? 1 : 0,
    detail: q.sameTypeExperience
      ? "Has executed this type of work before"
      : "No prior experience with this type of work",
  });

  components.push({
    key: "managementStability",
    label: "Ownership & management stability",
    weight: weights.managementStability,
    score: q.ownershipChanged ? 0 : 1,
    detail: q.ownershipChanged
      ? "Ownership/management changed within the last 2 years"
      : "No ownership or management change in the last 2 years",
  });

  components.push({
    key: "nitaqat",
    label: "Nitaqat compliance",
    weight: weights.nitaqat,
    score: QUALITATIVE.nitaqat[q.nitaqatBand],
    detail: `Nitaqat band: ${q.nitaqatBand.toLowerCase()}`,
  });

  const headroom = capacityHeadroomRatio(q, contract, latest);
  const ch = QUALITATIVE.capacityHeadroom;
  components.push({
    key: "capacityHeadroom",
    label: "Capacity headroom (computed)",
    weight: weights.capacityHeadroom,
    score: headroom === null ? null : clampScore(headroom, ch.floor, ch.ceil),
    detail:
      headroom === null
        ? "Latest revenue unavailable — commitment load cannot be sized"
        : `Backlog + this contract = ${headroom.toFixed(2)}× latest revenue (${q.runningProjectsCount} running projects)`,
  });

  components.push({
    key: "hiring",
    label: "Workforce readiness",
    weight: weights.hiring,
    score: q.heavyHiringNeeded ? 0.2 : 1,
    detail: q.heavyHiringNeeded
      ? "Significant hiring needed before execution"
      : "Current workforce covers the project",
  });

  components.push({
    key: "conduct",
    label: "Declared financial conduct",
    weight: weights.conduct,
    score: q.conductIncidents ? 0 : 1,
    detail: q.conductIncidents
      ? "Bounced cheques / past dues / restructuring declared"
      : "Clean conduct declaration",
  });

  components.push({
    key: "auditor",
    label: "Statement auditor tier",
    weight: weights.auditor,
    score:
      q.auditorTier === "BIG_FOUR"
        ? 1
        : q.auditorTier === "ACCREDITED_LOCAL"
          ? 0.7
          : q.auditorTier === "OTHER_FIRM"
            ? 0.4
            : 0,
    detail:
      q.auditorTier === "UNAUDITED"
        ? "Financials are not audited"
        : `Audited by a ${q.auditorTier === "BIG_FOUR" ? "Big-4" : q.auditorTier === "ACCREDITED_LOCAL" ? "SOCPA-accredited local" : "smaller"} firm`,
  });

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

/**
 * Hard caps raised by KYC answers. Returned separately from the score:
 * caps constrain the recommendation OF RECORD, never the numbers.
 */
export function detectQualitativeCaps(q: QualitativeInputs): HardCap[] {
  const caps: HardCap[] = [];
  if (q.guaranteeCalled) {
    caps.push({
      type: "GUARANTEE_PREVIOUSLY_CALLED",
      ceiling: HARD_CAPS.guaranteeCalled.ceiling,
      reason:
        "A guarantee issued for this company has been called before — direct evidence the risk being priced has materialized.",
    });
  }
  if (q.conductIncidents) {
    caps.push({
      type: "CONDUCT_INCIDENT_DECLARED",
      ceiling: HARD_CAPS.conductIncidents.ceiling,
      reason:
        "Bounced cheques, past dues, or restructured facilities were declared — payment conduct is the core risk of a guarantee.",
    });
  }
  if (q.nitaqatBand === "RED") {
    caps.push({
      type: "NITAQAT_RED",
      ceiling: HARD_CAPS.nitaqatRed.ceiling,
      reason:
        "Nitaqat band is Red — work-visa services can be frozen, stalling any labor-dependent project mid-execution.",
    });
  }
  return caps;
}

/**
 * Deterministic KYC flags for the officer + memo. Kept OUT of the financial
 * risk score's flag-penalty inputs (same principle as the identity flags):
 * these already shape the qualitative pillar; feeding them into the
 * financial trend component would double-count them.
 */
export function detectQualitativeFlags(
  q: QualitativeInputs,
  contract: ContractInputs | null,
  latest: YearFinancials | null,
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const year = latest ? [latest.fiscalYear] : [];

  if (q.guaranteeCalled) {
    flags.push({
      type: "GUARANTEE_PREVIOUSLY_CALLED",
      severity: "HIGH",
      explanation:
        "The applicant declared that a guarantee issued for them has been called before — the strongest negative signal for this product. Review the circumstances before any approval.",
      affectedYears: [],
      evidence: [],
    });
  }
  if (q.conductIncidents) {
    flags.push({
      type: "CONDUCT_INCIDENT_DECLARED",
      severity: "HIGH",
      explanation:
        "The applicant declared bounced cheques, past dues, or restructured facilities. The declaration is transparent — but the underlying conduct must be understood before relying on the financials.",
      affectedYears: [],
      evidence: [],
    });
  }
  if (q.nitaqatBand === "RED") {
    flags.push({
      type: "NITAQAT_RED",
      severity: "HIGH",
      explanation:
        "Nitaqat band is Red: new work visas and transfers can be blocked, which can stall a labor-dependent project regardless of its financials.",
      affectedYears: [],
      evidence: [],
    });
  } else if (q.nitaqatBand === "YELLOW") {
    flags.push({
      type: "NITAQAT_YELLOW",
      severity: "LOW",
      explanation:
        "Nitaqat band is Yellow — limited visa services; verify the labor plan for this project is achievable within the current band.",
      affectedYears: [],
      evidence: [],
    });
  }
  if (q.ongoingLitigation) {
    flags.push({
      type: "ONGOING_LITIGATION",
      severity: "MEDIUM",
      explanation:
        "Ongoing litigation or labor issues were declared — review the declared details for exposure that could reach this project.",
      affectedYears: [],
      evidence: [],
    });
  }
  if (q.hadProjectIssues) {
    flags.push({
      type: "PROJECT_EXECUTION_HISTORY",
      severity: "MEDIUM",
      explanation:
        "A past project was terminated, withdrawn, or hit major delays/penalties — direct execution-risk history to weigh against the current track record.",
      affectedYears: [],
      evidence: [],
    });
  }
  if (q.ownershipChanged) {
    flags.push({
      type: "OWNERSHIP_CHANGE",
      severity: "LOW",
      explanation:
        "Ownership or management changed within the last 2 years — the track record above may have been earned under different leadership.",
      affectedYears: [],
      evidence: [],
    });
  }
  if (!q.sameTypeExperience) {
    flags.push({
      type: "SCOPE_EXPERIENCE_GAP",
      severity: "MEDIUM",
      explanation:
        "The applicant has not executed this specific type of work before — registered activities are not the same as proven capability.",
      affectedYears: [],
      evidence: [],
    });
  }
  // Deterministic scope check: the company's registered sector vs the
  // contract's declared sector.
  if (
    q.companySector &&
    contract?.sector &&
    q.companySector !== contract.sector
  ) {
    flags.push({
      type: "SECTOR_MISMATCH",
      severity: "MEDIUM",
      explanation: `The contract is classified "${contract.sector}" while the company's registered sector is "${q.companySector}" — verify the contract scope sits within the applicant's registered line of business.`,
      affectedYears: [],
      evidence: [],
    });
  }

  // Capacity strain (computed) — mirrors the capacityHeadroom component.
  const headroom = capacityHeadroomRatio(q, contract, latest);
  if (headroom !== null && headroom >= QUALITATIVE.capacityHeadroom.floor) {
    flags.push({
      type: "CAPACITY_STRAIN",
      severity: "HIGH",
      explanation: `Committed workload (backlog + this contract) is ${headroom.toFixed(1)}× the latest annual revenue — the company would be executing far beyond its demonstrated capacity.`,
      affectedYears: year,
      evidence: latest?.revenue
        ? [{ label: "Latest revenue", fiscalYear: latest.fiscalYear, value: latest.revenue.toFixed(2) }]
        : [],
    });
  } else if (headroom !== null && headroom >= 2.5) {
    flags.push({
      type: "CAPACITY_STRAIN",
      severity: "MEDIUM",
      explanation: `Committed workload (backlog + this contract) is ${headroom.toFixed(1)}× the latest annual revenue — working capital will be stretched even if the ratios look healthy.`,
      affectedYears: year,
      evidence: latest?.revenue
        ? [{ label: "Latest revenue", fiscalYear: latest.fiscalYear, value: latest.revenue.toFixed(2) }]
        : [],
    });
  }

  // Guarantee burden across ALL banks (declared) vs equity — the within-reach
  // replacement for the SIMAH over-issuance check.
  if (contract && latest?.totalEquity && latest.totalEquity.gt(0)) {
    const totalExposure = add(q.outstandingGuarantees, contract.guaranteeAmount);
    const burden = ratio(totalExposure, latest.totalEquity);
    if (burden !== null && burden >= 1) {
      flags.push({
        type: "GUARANTEE_BURDEN",
        severity: burden >= 2 ? "HIGH" : "MEDIUM",
        explanation: `Declared outstanding guarantees plus this request equal ${burden.toFixed(1)}× total equity — the company's aggregate contingent exposure across all banks exceeds its own capital.`,
        affectedYears: year,
        evidence: [
          { label: "Total equity", fiscalYear: latest.fiscalYear, value: latest.totalEquity.toFixed(2) },
        ],
      });
    }
  }

  const order: Record<RiskFlag["severity"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}
