/**
 * ExecutionCapacityService — Daman's core question: can this company
 * financially execute THIS contract?
 *
 * Deterministic weighted scoring, 0–100. Ten components (financial health
 * 50 + contract stress 50); each maps a raw value onto 0–1 by linear clamp.
 * A component with missing inputs is EXCLUDED and the remaining weights are
 * renormalized — absence of data is reported, never silently scored as
 * failure. Full algorithm: docs/FINANCIAL_ENGINE.md. Weights/thresholds:
 * lib/finance/thresholds.ts (approved 2026-07-06).
 */
import { clampScore, ratio } from "@/lib/finance/decimal";
import { CAPACITY } from "@/lib/finance/thresholds";
import {
  computeYearRatios,
  derivedWorkingCapital,
} from "@/services/finance/financial-ratio-service";

import type {
  CapacityBand,
  ContractInputs,
  ExecutionCapacity,
  ScoreComponent,
  YearFinancials,
} from "@/lib/finance/types";

function band(score: number): CapacityBand {
  if (score >= CAPACITY.bands.strong) return "STRONG";
  if (score >= CAPACITY.bands.moderate) return "MODERATE";
  return "LIMITED";
}

const fmt = (n: number, dp = 2) => n.toFixed(dp);

export function assessExecutionCapacity(
  latest: YearFinancials,
  contract: ContractInputs,
): ExecutionCapacity {
  const { weights } = CAPACITY;
  const ratios = computeYearRatios(latest).ratios;
  const workingCapital = derivedWorkingCapital(latest);

  const components: ScoreComponent[] = [];

  // ---- Financial health (50)
  const cr = ratios.currentRatio;
  components.push({
    key: "liquidity",
    label: "Liquidity (current ratio)",
    weight: weights.liquidity,
    score: cr === null ? null : clampScore(cr, CAPACITY.currentRatio.floor, CAPACITY.currentRatio.ceil),
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
        : clampScore(de, CAPACITY.debtToEquity.floor, CAPACITY.debtToEquity.ceil),
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
    score: nm === null ? null : clampScore(nm, CAPACITY.netMargin.floor, CAPACITY.netMargin.ceil),
    detail: nm === null ? "Net margin unavailable" : `Net margin ${fmt(nm * 100, 1)}%`,
  });

  const ocf = ratios.operatingCashFlowRatio;
  components.push({
    key: "cashFlow",
    label: "Cash flow (OCF ratio)",
    weight: weights.cashFlow,
    score: ocf === null ? null : clampScore(ocf, CAPACITY.ocfRatio.floor, CAPACITY.ocfRatio.ceil),
    detail: ocf === null ? "Operating cash flow ratio unavailable" : `OCF / current liabilities ${fmt(ocf)}`,
  });

  // Working capital vs the assumed mobilization need (10% of contract value).
  const mobilizationNeed = contract.contractValue.mul(CAPACITY.mobilizationShareOfContract);
  const wcCoverage = ratio(workingCapital, mobilizationNeed);
  components.push({
    key: "workingCapital",
    label: "Working capital vs mobilization",
    weight: weights.workingCapital,
    score: wcCoverage === null ? null : clampScore(wcCoverage, 0, 1),
    detail:
      wcCoverage === null
        ? "Working capital unavailable"
        : `Working capital covers ${fmt(Math.max(0, wcCoverage) * 100, 0)}% of assumed mobilization (10% of contract)`,
  });

  // ---- Contract stress (50)
  const sizeVsRevenue = ratio(contract.contractValue, latest.revenue);
  components.push({
    key: "contractVsRevenue",
    label: "Contract size vs revenue",
    weight: weights.contractVsRevenue,
    score:
      sizeVsRevenue === null
        ? null
        : clampScore(sizeVsRevenue, CAPACITY.contractVsRevenue.floor, CAPACITY.contractVsRevenue.ceil),
    detail: sizeVsRevenue === null ? "Revenue unavailable" : `Contract is ${fmt(sizeVsRevenue, 2)}× annual revenue`,
  });

  const sizeVsAssets = ratio(contract.contractValue, latest.totalAssets);
  components.push({
    key: "contractVsAssets",
    label: "Contract size vs assets",
    weight: weights.contractVsAssets,
    score:
      sizeVsAssets === null
        ? null
        : clampScore(sizeVsAssets, CAPACITY.contractVsAssets.floor, CAPACITY.contractVsAssets.ceil),
    detail: sizeVsAssets === null ? "Total assets unavailable" : `Contract is ${fmt(sizeVsAssets, 2)}× total assets`,
  });

  const guaranteeVsEquity = equityNonPositive ? null : ratio(contract.guaranteeAmount, latest.totalEquity);
  components.push({
    key: "guaranteeVsEquity",
    label: "Guarantee vs equity",
    weight: weights.guaranteeVsEquity,
    score: equityNonPositive
      ? 0
      : guaranteeVsEquity === null
        ? null
        : clampScore(guaranteeVsEquity, CAPACITY.guaranteeVsEquity.floor, CAPACITY.guaranteeVsEquity.ceil),
    detail: equityNonPositive
      ? "Equity is non-positive"
      : guaranteeVsEquity === null
        ? "Equity unavailable"
        : `Guarantee is ${fmt(guaranteeVsEquity, 2)}× equity`,
  });

  const months = contract.durationMonths;
  components.push({
    key: "duration",
    label: "Contract duration",
    weight: weights.duration,
    score:
      months === null
        ? null
        : months <= CAPACITY.duration.ceilMonths
          ? 1
          : CAPACITY.duration.floorScore +
            (1 - CAPACITY.duration.floorScore) *
              clampScore(months, CAPACITY.duration.floorMonths, CAPACITY.duration.ceilMonths),
    detail: months === null ? "Project dates missing" : `${months} months`,
  });

  components.push({
    key: "beneficiary",
    label: "Beneficiary type",
    weight: weights.beneficiary,
    score: CAPACITY.beneficiaryScore[contract.beneficiaryType],
    detail: contract.beneficiaryType === "GOVERNMENT" ? "Government beneficiary" : "Private beneficiary",
  });

  // ---- Weighted total over available components, renormalized to 0–100.
  const available = components.filter((c) => c.score !== null);
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
  const weighted = available.reduce((sum, c) => sum + c.score! * c.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100);

  return {
    score,
    band: band(score),
    components,
    missingInputs: components.filter((c) => c.score === null).map((c) => c.label),
  };
}
