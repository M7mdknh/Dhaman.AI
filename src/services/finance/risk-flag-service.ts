/**
 * RiskFlagService — deterministic rule-based flag detection. Every flag
 * carries type, severity, affected years, numeric evidence, and a template
 * explanation (fixed wording — no generated narrative, no GPT).
 * Thresholds live in lib/finance/thresholds.ts only.
 */
import { changeFraction, growth, ratio } from "@/lib/finance/decimal";
import { FLAGS } from "@/lib/finance/thresholds";
import {
  computeYearRatios,
  derivedTotalDebt,
  derivedWorkingCapital,
} from "@/services/finance/financial-ratio-service";

import type { FlagEvidence, Money, RiskFlag, YearFinancials } from "@/lib/finance/types";

const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

function money(label: string, fiscalYear: number, value: Money | null): FlagEvidence[] {
  return value == null ? [] : [{ label, fiscalYear, value: value.toFixed(2) }];
}

/** Runs every rule over ascending years; ordering: HIGH → MEDIUM → LOW. */
export function detectRiskFlags(years: YearFinancials[]): RiskFlag[] {
  const sorted = [...years].sort((a, b) => a.fiscalYear - b.fiscalYear);
  if (sorted.length === 0) return [];

  const flags: RiskFlag[] = [];
  const latest = sorted.at(-1)!;
  const prior = sorted.length > 1 ? sorted.at(-2)! : null;
  const latestRatios = computeYearRatios(latest).ratios;
  const priorRatios = prior ? computeYearRatios(prior).ratios : null;
  const pairYears = prior ? [prior.fiscalYear, latest.fiscalYear] : [latest.fiscalYear];

  // ---- Revenue decline / spike (YoY)
  const revenueChange = prior ? growth(latest.revenue, prior.revenue) : null;
  if (revenueChange !== null && revenueChange <= FLAGS.revenueDecline.medium) {
    flags.push({
      type: "REVENUE_DECLINE",
      severity: revenueChange <= FLAGS.revenueDecline.high ? "HIGH" : "MEDIUM",
      explanation: `Revenue fell ${pct(Math.abs(revenueChange))} year over year.`,
      affectedYears: pairYears,
      evidence: [
        ...money("Revenue", prior!.fiscalYear, prior!.revenue),
        ...money("Revenue", latest.fiscalYear, latest.revenue),
      ],
    });
  }
  if (revenueChange !== null && revenueChange >= FLAGS.revenueSpike.low) {
    flags.push({
      type: "REVENUE_SPIKE",
      severity: "LOW",
      explanation: `Revenue grew ${pct(revenueChange)} year over year — rapid growth can strain working capital and delivery capacity (overtrading).`,
      affectedYears: pairYears,
      evidence: [
        ...money("Revenue", prior!.fiscalYear, prior!.revenue),
        ...money("Revenue", latest.fiscalYear, latest.revenue),
      ],
    });
  }

  // ---- Cash deterioration (YoY)
  const cashChange = prior ? changeFraction(latest.cash, prior.cash) : null;
  if (cashChange !== null && cashChange <= FLAGS.cashDeterioration.medium) {
    flags.push({
      type: "CASH_DETERIORATION",
      severity: cashChange <= FLAGS.cashDeterioration.high ? "HIGH" : "MEDIUM",
      explanation: `Cash and equivalents dropped ${pct(Math.abs(cashChange))} year over year.`,
      affectedYears: pairYears,
      evidence: [
        ...money("Cash", prior!.fiscalYear, prior!.cash),
        ...money("Cash", latest.fiscalYear, latest.cash),
      ],
    });
  }

  // ---- Debt spike (YoY, only when debt is material vs assets)
  const latestDebt = derivedTotalDebt(latest);
  const priorDebt = prior ? derivedTotalDebt(prior) : null;
  const debtChange = changeFraction(latestDebt, priorDebt);
  const debtMaterial = (ratio(latestDebt, latest.totalAssets) ?? 0) >= FLAGS.debtSpike.materialityVsAssets;
  if (debtChange !== null && debtChange >= FLAGS.debtSpike.medium && debtMaterial) {
    flags.push({
      type: "DEBT_SPIKE",
      severity: debtChange >= FLAGS.debtSpike.high ? "HIGH" : "MEDIUM",
      explanation: `Total debt increased ${pct(debtChange)} year over year.`,
      affectedYears: pairYears,
      evidence: [
        ...money("Total debt", prior!.fiscalYear, priorDebt),
        ...money("Total debt", latest.fiscalYear, latestDebt),
      ],
    });
  }

  // ---- Negative working capital (latest year)
  const wc = derivedWorkingCapital(latest);
  if (wc !== null && wc.lt(0)) {
    flags.push({
      type: "NEGATIVE_WORKING_CAPITAL",
      severity: "HIGH",
      explanation:
        "Current liabilities exceed current assets — the company may be unable to fund day-to-day obligations.",
      affectedYears: [latest.fiscalYear],
      evidence: money("Working capital", latest.fiscalYear, wc),
    });
  }

  // ---- Negative operating cash flow (any year; latest = HIGH)
  const negativeOcfYears = sorted.filter((y) => y.operatingCashFlow?.lt(0));
  if (negativeOcfYears.length > 0) {
    const includesLatest = negativeOcfYears.some((y) => y.fiscalYear === latest.fiscalYear);
    flags.push({
      type: "NEGATIVE_OPERATING_CASH_FLOW",
      severity: includesLatest ? "HIGH" : "MEDIUM",
      explanation: "Core operations consumed more cash than they generated.",
      affectedYears: negativeOcfYears.map((y) => y.fiscalYear),
      evidence: negativeOcfYears.flatMap((y) =>
        money("Operating cash flow", y.fiscalYear, y.operatingCashFlow),
      ),
    });
  }

  // ---- Rapid receivable growth outpacing revenue
  const receivableChange = prior ? changeFraction(latest.receivables, prior.receivables) : null;
  if (
    receivableChange !== null &&
    revenueChange !== null &&
    receivableChange - revenueChange >= FLAGS.receivableGrowthGapPp
  ) {
    flags.push({
      type: "RAPID_RECEIVABLE_GROWTH",
      severity: "MEDIUM",
      explanation: `Receivables grew ${pct(receivableChange)} while revenue changed ${pct(revenueChange)} — collections may be deteriorating.`,
      affectedYears: pairYears,
      evidence: [
        ...money("Receivables", prior!.fiscalYear, prior!.receivables),
        ...money("Receivables", latest.fiscalYear, latest.receivables),
      ],
    });
  }

  // ---- Net margin deterioration (percentage points)
  const marginDrop =
    priorRatios?.netMargin != null && latestRatios.netMargin != null
      ? priorRatios.netMargin - latestRatios.netMargin
      : null;
  if (marginDrop !== null && marginDrop >= FLAGS.marginDeteriorationPp.medium) {
    flags.push({
      type: "MARGIN_DETERIORATION",
      severity: marginDrop >= FLAGS.marginDeteriorationPp.high ? "HIGH" : "MEDIUM",
      explanation: `Net profit margin fell ${(marginDrop * 100).toFixed(1)} percentage points year over year.`,
      affectedYears: pairYears,
      evidence: [
        { label: "Net margin", fiscalYear: prior!.fiscalYear, value: pct(priorRatios!.netMargin!) },
        { label: "Net margin", fiscalYear: latest.fiscalYear, value: pct(latestRatios.netMargin!) },
      ],
    });
  }

  // ---- Liquidity: below 1.0 (HIGH) or sharp deterioration (MEDIUM)
  if (latestRatios.currentRatio !== null) {
    if (latestRatios.currentRatio < FLAGS.liquidity.criticalCurrentRatio) {
      flags.push({
        type: "LIQUIDITY_CRITICAL",
        severity: "HIGH",
        explanation: `Current ratio is ${latestRatios.currentRatio.toFixed(2)} — below 1.0, short-term obligations exceed short-term resources.`,
        affectedYears: [latest.fiscalYear],
        evidence: [
          { label: "Current ratio", fiscalYear: latest.fiscalYear, value: latestRatios.currentRatio.toFixed(2) },
        ],
      });
    } else if (
      priorRatios?.currentRatio != null &&
      priorRatios.currentRatio > 0 &&
      (priorRatios.currentRatio - latestRatios.currentRatio) / priorRatios.currentRatio >=
        FLAGS.liquidity.deteriorationDrop
    ) {
      flags.push({
        type: "LIQUIDITY_DETERIORATION",
        severity: "MEDIUM",
        explanation: `Current ratio fell from ${priorRatios.currentRatio.toFixed(2)} to ${latestRatios.currentRatio.toFixed(2)} year over year.`,
        affectedYears: pairYears,
        evidence: [
          { label: "Current ratio", fiscalYear: prior!.fiscalYear, value: priorRatios.currentRatio.toFixed(2) },
          { label: "Current ratio", fiscalYear: latest.fiscalYear, value: latestRatios.currentRatio.toFixed(2) },
        ],
      });
    }
  }

  // ---- Equity erosion
  if (latest.totalEquity?.lte(0)) {
    flags.push({
      type: "NEGATIVE_EQUITY",
      severity: "HIGH",
      explanation: "Total equity is non-positive — accumulated losses exceed contributed capital.",
      affectedYears: [latest.fiscalYear],
      evidence: money("Total equity", latest.fiscalYear, latest.totalEquity),
    });
  } else {
    const equityChange = prior ? changeFraction(latest.totalEquity, prior.totalEquity) : null;
    if (equityChange !== null && equityChange <= FLAGS.equityErosion.medium) {
      flags.push({
        type: "EQUITY_EROSION",
        severity: "MEDIUM",
        explanation: `Total equity declined ${pct(Math.abs(equityChange))} year over year.`,
        affectedYears: pairYears,
        evidence: [
          ...money("Total equity", prior!.fiscalYear, prior!.totalEquity),
          ...money("Total equity", latest.fiscalYear, latest.totalEquity),
        ],
      });
    }
  }

  // ---- Generic large swings on core figures (attention, not judgment)
  if (prior) {
    const swings: [string, Money | null, Money | null][] = [
      ["Total assets", prior.totalAssets, latest.totalAssets],
      ["Total equity", prior.totalEquity, latest.totalEquity],
      ["Inventory", prior.inventory, latest.inventory],
    ];
    for (const [label, before, after] of swings) {
      const change = changeFraction(after, before);
      if (change !== null && Math.abs(change) >= FLAGS.largeSwing) {
        flags.push({
          type: "LARGE_YOY_SWING",
          severity: "LOW",
          explanation: `${label} moved ${pct(change)} year over year — verify the underlying cause with the applicant.`,
          affectedYears: pairYears,
          evidence: [
            ...money(label, prior.fiscalYear, before),
            ...money(label, latest.fiscalYear, after),
          ],
        });
      }
    }
  }

  const order: Record<RiskFlag["severity"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}
