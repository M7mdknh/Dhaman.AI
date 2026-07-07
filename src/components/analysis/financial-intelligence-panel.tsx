import { CapacityCard } from "@/components/analysis/capacity-card";
import { FlagList } from "@/components/analysis/flag-list";
import { GrowthTable, RatioTables } from "@/components/analysis/ratio-tables";
import { RiskScoreCard } from "@/components/analysis/risk-gauge";
import { StatTile, type DeltaSentiment } from "@/components/analysis/stat-tile";
import { TrendChart } from "@/components/analysis/trend-chart";
import { Card, CardContent } from "@/components/ui/card";
import { formatPercent, formatRatio } from "@/lib/format";

import type { FinancialIntelligenceReport, RatioKey } from "@/lib/finance/types";

/** Trend charts required by the sprint spec, in display order. */
const CHARTED_TRENDS = [
  "revenue",
  "netIncome",
  "cash",
  "totalDebt",
  "workingCapital",
  "operatingCashFlow",
];

interface Kpi {
  label: string;
  value: string;
  delta: { text: string; sentiment: DeltaSentiment } | null;
  hint?: string;
}

function deltaSentiment(diff: number, upIsGood: boolean): DeltaSentiment {
  if (diff === 0) return "neutral";
  return diff > 0 === upIsGood ? "positive" : "negative";
}

/** Display shaping only — every figure is computed by the engine services. */
function buildKpis(report: FinancialIntelligenceReport): Kpi[] {
  const latest = report.ratiosByYear.at(-1)!;
  const prior = report.ratiosByYear.at(-2) ?? null;
  const hint = prior ? `vs FY${prior.fiscalYear}` : undefined;

  const ratioKpi = (
    label: string,
    key: RatioKey,
    upIsGood: boolean,
    asPercent = false,
  ): Kpi => {
    const current = latest.ratios[key];
    const previous = prior?.ratios[key] ?? null;
    const diff = current !== null && previous !== null ? current - previous : null;
    return {
      label,
      value: asPercent ? formatPercent(current) : formatRatio(current),
      delta:
        diff === null
          ? null
          : {
              text: asPercent
                ? `${diff >= 0 ? "+" : "−"}${Math.abs(diff * 100).toFixed(1)}pp`
                : `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)}`,
              sentiment: deltaSentiment(diff, upIsGood),
            },
      hint,
    };
  };

  const growthPeriod = report.growthPeriods.at(-1) ?? null;
  const revenueGrowth = growthPeriod?.growth.revenueGrowth ?? null;
  const growthKpi: Kpi = {
    label: "Revenue growth",
    value:
      revenueGrowth === null
        ? "—"
        : `${revenueGrowth >= 0 ? "+" : "−"}${Math.abs(revenueGrowth * 100).toFixed(1)}%`,
    delta:
      revenueGrowth === null
        ? null
        : { text: revenueGrowth >= 0 ? "▲" : "▼", sentiment: deltaSentiment(revenueGrowth, true) },
    hint: growthPeriod ? `FY${growthPeriod.fromYear} → FY${growthPeriod.toYear}` : undefined,
  };

  return [
    ratioKpi("Liquidity · current ratio", "currentRatio", true),
    ratioKpi("Leverage · debt-to-equity", "debtToEquity", false),
    ratioKpi("Profitability · net margin", "netMargin", true, true),
    ratioKpi("Cash flow · OCF ratio", "operatingCashFlowRatio", true),
    growthKpi,
  ];
}

/**
 * The full deterministic Financial Intelligence dashboard body: capacity
 * (primary KPI) + risk gauge (secondary), KPI strip, flags, trend charts,
 * ratio tables. Shared by the contractor analysis page and the officer
 * review workspace — display only, every figure comes from the engines.
 */
export function FinancialIntelligencePanel({
  report,
}: {
  report: FinancialIntelligenceReport;
}) {
  return (
    <div className="space-y-6">
      {/* Underwriting Capacity is the platform's primary KPI; Risk Score is secondary. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {report.capacity ? (
            <CapacityCard capacity={report.capacity} />
          ) : (
            <Card className="h-full">
              <CardContent className="flex h-full items-center justify-center py-16 text-center text-sm text-muted-foreground">
                Underwriting capacity needs completed contract details.
              </CardContent>
            </Card>
          )}
        </div>
        <RiskScoreCard risk={report.risk} />
      </div>

      <section aria-label="Key financial indicators">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {buildKpis(report).map((kpi) => (
            <StatTile key={kpi.label} {...kpi} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Latest fiscal year (FY{report.latestYear}). “—” = not computable
          from the printed statements.
        </p>
      </section>

      <FlagList flags={report.flags} currency={report.currency} />

      <section aria-label="Financial trends">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Trends</h2>
        {report.years.length < 2 && (
          <p className="mb-3 text-xs text-muted-foreground">
            Only one fiscal year is available — year-over-year comparisons
            need at least two.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {CHARTED_TRENDS.map((key) => {
            const trend = report.trends.find((t) => t.key === key);
            if (!trend) return null;
            return (
              <TrendChart
                key={trend.key}
                title={trend.label}
                unit={trend.unit}
                currency={report.currency}
                points={trend.series.map((p) => ({
                  fiscalYear: p.fiscalYear,
                  value: p.value === null ? null : Number(p.value),
                }))}
                latestChange={trend.yoyChanges.at(-1)?.changePct ?? null}
              />
            );
          })}
        </div>
      </section>

      <section aria-label="Financial ratios" className="space-y-6">
        <h2 className="text-sm font-semibold text-foreground">Financial Ratios</h2>
        <RatioTables ratiosByYear={report.ratiosByYear} currency={report.currency} />
        <GrowthTable periods={report.growthPeriods} />
      </section>
    </div>
  );
}
