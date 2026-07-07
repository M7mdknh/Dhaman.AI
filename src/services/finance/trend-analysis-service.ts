/**
 * TrendAnalysisService — multi-year metric series with YoY changes and a
 * direction classification. Pure structured data; never narratives.
 * Direction is raw (INCREASING / DECREASING / STABLE) — whether a movement
 * is good or bad is the RiskFlagService's judgment, not the trend's.
 */
import { changeFraction, toMoneyString } from "@/lib/finance/decimal";
import { TREND_STABILITY_BAND } from "@/lib/finance/thresholds";
import {
  computeYearRatios,
  derivedTotalDebt,
  derivedWorkingCapital,
} from "@/services/finance/financial-ratio-service";

import type { Money, MetricTrend, TrendDirection, YearFinancials } from "@/lib/finance/types";

interface MoneyMetricDef {
  key: string;
  label: string;
  pick: (y: YearFinancials) => Money | null;
}

/** The trend metrics required by the sprint spec, in display order. */
const MONEY_METRICS: MoneyMetricDef[] = [
  { key: "revenue", label: "Revenue", pick: (y) => y.revenue },
  { key: "netIncome", label: "Net Income", pick: (y) => y.netIncome },
  { key: "cash", label: "Cash & Equivalents", pick: (y) => y.cash },
  { key: "totalDebt", label: "Total Debt", pick: derivedTotalDebt },
  { key: "workingCapital", label: "Working Capital", pick: derivedWorkingCapital },
  { key: "totalEquity", label: "Total Equity", pick: (y) => y.totalEquity },
  { key: "operatingCashFlow", label: "Operating Cash Flow", pick: (y) => y.operatingCashFlow },
];

function directionOf(latestChange: number | null): TrendDirection | null {
  if (latestChange === null) return null;
  if (Math.abs(latestChange) < TREND_STABILITY_BAND) return "STABLE";
  return latestChange > 0 ? "INCREASING" : "DECREASING";
}

function moneyTrend(def: MoneyMetricDef, sorted: YearFinancials[]): MetricTrend {
  const values = sorted.map((y) => def.pick(y));
  const yoyChanges = sorted.slice(1).map((y, i) => ({
    fromYear: sorted[i].fiscalYear,
    toYear: y.fiscalYear,
    changePct: changeFraction(values[i + 1], values[i]),
  }));
  return {
    key: def.key,
    label: def.label,
    unit: "money",
    series: sorted.map((y, i) => ({ fiscalYear: y.fiscalYear, value: toMoneyString(values[i]) })),
    yoyChanges,
    direction: directionOf(yoyChanges.at(-1)?.changePct ?? null),
  };
}

/** Net margin as a percent-unit trend (profitability change over time). */
function netMarginTrend(sorted: YearFinancials[]): MetricTrend {
  const values = sorted.map((y) => computeYearRatios(y).ratios.netMargin);
  const yoyChanges = sorted.slice(1).map((y, i) => {
    const prior = values[i];
    const current = values[i + 1];
    return {
      fromYear: sorted[i].fiscalYear,
      toYear: y.fiscalYear,
      // Percentage-POINT change for margins (fraction difference).
      changePct: prior === null || current === null ? null : Number((current - prior).toFixed(4)),
    };
  });
  return {
    key: "netMargin",
    label: "Net Profit Margin",
    unit: "percent",
    series: sorted.map((y, i) => ({ fiscalYear: y.fiscalYear, value: values[i] })),
    yoyChanges,
    direction: directionOf(yoyChanges.at(-1)?.changePct ?? null),
  };
}

/**
 * All metric trends, ascending years. With fewer than 2 usable years the
 * series still renders but yoyChanges is empty and direction null.
 */
export function computeTrends(years: YearFinancials[]): MetricTrend[] {
  const sorted = [...years].sort((a, b) => a.fiscalYear - b.fiscalYear);
  return [...MONEY_METRICS.map((def) => moneyTrend(def, sorted)), netMarginTrend(sorted)];
}
