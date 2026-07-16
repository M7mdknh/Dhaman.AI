/**
 * ContractRiskService — deterministic scoring of the guaranteed contract's
 * structure (the contract-risk pillar of the composite grade). Nine
 * weighted components mapping the structured Step-3 fields — plus two
 * COMPUTED cross-checks against the KYC answers and the audited history
 * (jump ratio, margin realism) — to 0–1 SAFETY sub-scores. Published score
 * is (1 − weighted safety) × 100, HIGHER = RISKIER. Missing inputs (cases
 * predating the detailed wizard) are excluded and weights renormalized.
 *
 * Weights and mappings: lib/finance/thresholds.ts (CONTRACT_RISK) only.
 * No ML, no LLM — the same contract always produces the same score.
 */
import { clampScore, ratio } from "@/lib/finance/decimal";
import { CONTRACT_RISK, HARD_CAPS } from "@/lib/finance/thresholds";
import { computeYearRatios } from "@/services/finance/financial-ratio-service";
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

const WEEKS_PER_MONTH = 4.345;

/** Contract value / largest completed project (null without KYC data). */
export function jumpRatio(
  contract: ContractInputs,
  qualitative: QualitativeInputs | null,
): number | null {
  if (!qualitative) return null;
  if (qualitative.largestProjectValue.lte(0)) {
    // No completed project of any size — every contract is an infinite jump.
    return Number.POSITIVE_INFINITY;
  }
  return ratio(contract.contractValue, qualitative.largestProjectValue);
}

/**
 * Months of spend before the first payment lands: mobilization + one
 * billing cycle + the certification-to-payment period.
 */
export function burnWindowMonths(contract: ContractInputs): number | null {
  if (
    contract.mobilizationWeeks === null ||
    contract.billingCycle === null ||
    contract.paymentPeriodDays === null
  ) {
    return null;
  }
  return (
    contract.mobilizationWeeks / WEEKS_PER_MONTH +
    CONTRACT_RISK.cashGap.billingCycleMonths[contract.billingCycle] +
    contract.paymentPeriodDays / 30
  );
}

/**
 * Cash-gap coverage: the advance measured against the share of contract
 * value consumed before the first payment arrives (linear-spend
 * assumption): advance% × durationMonths / (100 × burn months). ≥1 means
 * the advance fully funds the gap.
 */
export function cashGapCoverage(contract: ContractInputs): number | null {
  const burn = burnWindowMonths(contract);
  if (
    burn === null ||
    contract.advancePaymentPct === null ||
    contract.durationMonths === null ||
    contract.durationMonths <= 0
  ) {
    return null;
  }
  if (burn <= 0) return CONTRACT_RISK.cashGap.fullCoverage; // paid immediately
  return (contract.advancePaymentPct * contract.durationMonths) / (100 * burn);
}

/** Latest historical gross margin fraction from the audited statements. */
function historicalGrossMargin(latest: YearFinancials | null): number | null {
  if (!latest) return null;
  return computeYearRatios(latest).ratios.grossMargin;
}

export function assessContractRisk(
  contract: ContractInputs,
  qualitative: QualitativeInputs | null,
  latest: YearFinancials | null,
): PillarAssessment {
  const { weights } = CONTRACT_RISK;
  const components: ScoreComponent[] = [];

  const jump = jumpRatio(contract, qualitative);
  components.push({
    key: "jumpRisk",
    label: "Scale jump vs largest completed project",
    weight: weights.jumpRisk,
    score:
      jump === null
        ? null
        : jump === Number.POSITIVE_INFINITY
          ? 0
          : clampScore(jump, CONTRACT_RISK.jumpRatio.floor, CONTRACT_RISK.jumpRatio.ceil),
    detail:
      jump === null
        ? "KYC track record unavailable"
        : jump === Number.POSITIVE_INFINITY
          ? "No completed project declared — scale entirely unproven"
          : `Contract is ${jump.toFixed(2)}× the largest completed project`,
  });

  components.push({
    key: "role",
    label: "Contractor role",
    weight: weights.role,
    score:
      contract.contractorRole === null
        ? null
        : contract.contractorRole === "MAIN_CONTRACTOR"
          ? CONTRACT_RISK.role.main
          : contract.backToBackPayment
            ? CONTRACT_RISK.role.subBackToBack
            : CONTRACT_RISK.role.subDirect,
    detail:
      contract.contractorRole === null
        ? "Role not declared"
        : contract.contractorRole === "MAIN_CONTRACTOR"
          ? "Main contractor — paid directly by the owner"
          : contract.backToBackPayment
            ? "Subcontractor on back-to-back terms — layered payment risk"
            : "Subcontractor with independent payment terms",
  });

  const prior = contract.priorContractsWithBeneficiary;
  const bh = CONTRACT_RISK.beneficiaryHistory;
  components.push({
    key: "beneficiaryHistory",
    label: "History with this beneficiary",
    weight: weights.beneficiaryHistory,
    score:
      prior === null
        ? null
        : prior >= bh.repeat
          ? bh.repeatScore
          : prior >= 1
            ? bh.someScore
            : bh.noneScore,
    detail:
      prior === null
        ? "Prior-award history not declared"
        : prior === 0
          ? "First contract with this awarding entity"
          : `${prior} prior contract${prior === 1 ? "" : "s"} with this awarding entity`,
  });

  const coverage = cashGapCoverage(contract);
  components.push({
    key: "cashGap",
    label: "Advance coverage of the cash gap (computed)",
    weight: weights.cashGap,
    score:
      coverage === null
        ? null
        : clampScore(coverage, 0, CONTRACT_RISK.cashGap.fullCoverage),
    detail:
      coverage === null
        ? "Payment mechanics or project duration unavailable"
        : `Advance covers ${(Math.min(coverage, 1) * 100).toFixed(0)}% of the pre-payment spend window`,
  });

  const margin = contract.expectedGrossMarginPct;
  const mb = CONTRACT_RISK.marginBuffer;
  components.push({
    key: "marginBuffer",
    label: "Expected gross margin buffer",
    weight: weights.marginBuffer,
    score: margin === null ? null : clampScore(margin, mb.floorPct, mb.ceilPct),
    detail:
      margin === null
        ? "Expected margin not declared"
        : `Expected gross margin ${margin.toFixed(1)}%`,
  });

  const history = historicalGrossMargin(latest);
  const mr = CONTRACT_RISK.marginRealism;
  const optimism =
    margin === null || history === null || history <= 0
      ? null
      : margin / 100 / history;
  components.push({
    key: "marginRealism",
    label: "Margin realism vs audited history (computed)",
    weight: weights.marginRealism,
    score: optimism === null ? null : clampScore(optimism, mr.floor, mr.ceil),
    detail:
      optimism === null
        ? "No audited gross-margin history to compare against"
        : `Declared margin is ${optimism.toFixed(2)}× the audited historical gross margin`,
  });

  components.push({
    key: "awardMethod",
    label: "Award method",
    weight: weights.awardMethod,
    score: contract.awardMethod === null ? null : CONTRACT_RISK.awardMethod[contract.awardMethod],
    detail:
      contract.awardMethod === null
        ? "Award method not declared"
        : contract.awardMethod === "PUBLIC_TENDER"
          ? "Won in a public tender — pricing pressure"
          : contract.awardMethod === "LIMITED_TENDER"
            ? "Won in a limited tender"
            : "Direct award",
  });

  const bt = CONTRACT_RISK.bondTerms;
  components.push({
    key: "bondTerms",
    label: "Bond call terms",
    weight: weights.bondTerms,
    score:
      contract.onFirstDemand === null
        ? null
        : !contract.onFirstDemand
          ? bt.conditional
          : contract.extendOrPay
            ? bt.firstDemandExtendOrPay
            : bt.firstDemand,
    detail:
      contract.onFirstDemand === null
        ? "Bond terms not declared"
        : !contract.onFirstDemand
          ? "Conditional bond"
          : contract.extendOrPay
            ? "On first demand with an extend-or-pay clause — maximum call risk"
            : "On first demand",
  });

  const ld = CONTRACT_RISK.ldExposure;
  const ldScore =
    contract.ldCapPct === null
      ? null
      : contract.ldRatePctPerWeek !== null && contract.ldRatePctPerWeek === 0
        ? 1
        : clampScore(contract.ldCapPct, ld.floorPct, ld.ceilPct);
  components.push({
    key: "ldExposure",
    label: "Liquidated damages exposure",
    weight: weights.ldExposure,
    score: ldScore,
    detail:
      contract.ldCapPct === null
        ? "LD terms not declared"
        : contract.ldRatePctPerWeek === 0
          ? "No liquidated damages"
          : `LDs ${contract.ldRatePctPerWeek?.toFixed(2) ?? "?"}%/week capped at ${contract.ldCapPct.toFixed(1)}%`,
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

/** Hard caps raised by the contract's structure. */
export function detectContractCaps(
  contract: ContractInputs,
  qualitative: QualitativeInputs | null,
): HardCap[] {
  const caps: HardCap[] = [];
  const jump = jumpRatio(contract, qualitative);
  if (jump !== null && jump > HARD_CAPS.jumpRisk.triggerRatio) {
    caps.push({
      type: "JUMP_RISK",
      ceiling: HARD_CAPS.jumpRisk.ceiling,
      reason:
        jump === Number.POSITIVE_INFINITY
          ? "No completed project was declared — execution at this scale is entirely unproven."
          : `This contract is ${jump.toFixed(1)}× the largest project the applicant has ever completed — execution capability is unproven at this scale, whatever the ratios say.`,
    });
  }
  return caps;
}

/** Deterministic contract-structure flags for the officer + memo. */
export function detectContractRiskFlags(
  contract: ContractInputs,
  qualitative: QualitativeInputs | null,
  latest: YearFinancials | null,
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  const jump = jumpRatio(contract, qualitative);
  if (jump !== null && jump > 2) {
    flags.push({
      type: "JUMP_RISK",
      severity: jump > HARD_CAPS.jumpRisk.triggerRatio ? "HIGH" : "MEDIUM",
      explanation:
        jump === Number.POSITIVE_INFINITY
          ? "No completed project was declared — this contract would be the applicant's first at any scale."
          : `This contract is ${jump.toFixed(1)}× the largest project the applicant has completed — scale jumps are the classic contractor failure mode.`,
      affectedYears: [],
      evidence: [],
    });
  }

  const coverage = cashGapCoverage(contract);
  if (coverage !== null && coverage < CONTRACT_RISK.cashGap.flagBelow) {
    const burn = burnWindowMonths(contract);
    flags.push({
      type: "CASH_GAP",
      severity: "MEDIUM",
      explanation: `The ${contract.advancePaymentPct?.toFixed(0) ?? "0"}% advance covers only ${(coverage * 100).toFixed(0)}% of the ~${burn?.toFixed(1)} months of spend before the first payment lands — consider pairing the guarantee with project financing.`,
      affectedYears: [],
      evidence: [],
    });
  }

  const margin = contract.expectedGrossMarginPct;
  if (margin !== null && margin < CONTRACT_RISK.marginBuffer.floorPct) {
    flags.push({
      type: "THIN_MARGIN",
      severity: "MEDIUM",
      explanation: `Expected gross margin is ${margin.toFixed(1)}% — below 10% there is no buffer for delays or cost inflation.`,
      affectedYears: [],
      evidence: [],
    });
  }

  const history = historicalGrossMargin(latest);
  if (margin !== null && history !== null && history > 0) {
    const optimism = margin / 100 / history;
    if (optimism > CONTRACT_RISK.marginRealism.flagAbove) {
      flags.push({
        type: "MARGIN_OPTIMISM",
        severity: "MEDIUM",
        explanation: `The declared ${margin.toFixed(1)}% contract margin is ${optimism.toFixed(1)}× the company's audited gross margin (${(history * 100).toFixed(1)}%) — tender-winning optimism that the audited history does not support.`,
        affectedYears: latest ? [latest.fiscalYear] : [],
        evidence: latest
          ? [{ label: "Historical gross margin", fiscalYear: latest.fiscalYear, value: `${(history * 100).toFixed(1)}%` }]
          : [],
      });
    }
  }

  if (contract.onFirstDemand && contract.extendOrPay) {
    flags.push({
      type: "BOND_TAIL_RISK",
      severity: "MEDIUM",
      explanation:
        "The bond is on first demand AND carries an extend-or-pay clause — the beneficiary can force extensions indefinitely or call at will.",
      affectedYears: [],
      evidence: [],
    });
  }

  if (contract.contractorRole === "SUBCONTRACTOR" && contract.backToBackPayment) {
    flags.push({
      type: "BACK_TO_BACK_PAYMENT",
      severity: "MEDIUM",
      explanation:
        "The applicant is a subcontractor paid back-to-back — cash arrives only when the main contractor is paid, adding a payment layer the bank does not underwrite.",
      affectedYears: [],
      evidence: [],
    });
  }

  // Consistency: the issued guarantee must match the bond the contract text
  // requires (spec: warn when they differ).
  if (
    contract.requiredBondPct !== null &&
    contract.guaranteePercentage !== null &&
    Math.abs(contract.requiredBondPct - contract.guaranteePercentage) > 0.01
  ) {
    flags.push({
      type: "BOND_PERCENTAGE_MISMATCH",
      severity: "MEDIUM",
      explanation: `The requested guarantee is ${contract.guaranteePercentage.toFixed(2)}% of the contract value but the contract text requires ${contract.requiredBondPct.toFixed(2)}% — the issued bond must match the contract exactly.`,
      affectedYears: [],
      evidence: [],
    });
  }

  const order: Record<RiskFlag["severity"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}
