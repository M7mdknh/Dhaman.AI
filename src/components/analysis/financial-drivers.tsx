import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BADGE_TONE, BAR_TONE, driverConditionFor } from "@/lib/finance/display";
import { formatMoneyWhole, formatPercent, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { FinancialIntelligenceReport, ScoreComponent } from "@/lib/finance/types";

interface Driver {
  label: string;
  /** 0–1 deterministic sub-score (null = not computable). */
  score: number | null;
  metricLabel: string;
  metricValue: string;
}

/** Sub-score for a driver, preferring capacity, falling back to risk. */
function subScore(
  key: string,
  capacity: ScoreComponent[] | undefined,
  risk: ScoreComponent[],
): number | null {
  const fromCapacity = capacity?.find((c) => c.key === key);
  if (fromCapacity) return fromCapacity.score;
  return risk.find((c) => c.key === key)?.score ?? null;
}

/**
 * The five deterministic drivers behind the scores, in credit-committee order.
 * Sub-scores come straight from the engine components; the supporting metric
 * is the already-computed latest-year ratio — nothing is recalculated here.
 */
function buildDrivers(report: FinancialIntelligenceReport): Driver[] {
  const capacity = report.capacity?.components;
  const risk = report.risk.components;
  const latest = report.ratiosByYear.at(-1)!;

  return [
    {
      label: "Liquidity",
      score: subScore("liquidity", capacity, risk),
      metricLabel: "Current ratio",
      metricValue: formatRatio(latest.ratios.currentRatio),
    },
    {
      label: "Leverage",
      score: subScore("leverage", capacity, risk),
      metricLabel: "Debt-to-equity",
      metricValue: formatRatio(latest.ratios.debtToEquity),
    },
    {
      label: "Profitability",
      score: subScore("profitability", capacity, risk),
      metricLabel: "Net margin",
      metricValue: formatPercent(latest.ratios.netMargin),
    },
    {
      label: "Cash Flow",
      score: subScore("cashFlow", capacity, risk),
      metricLabel: "OCF ratio",
      metricValue: formatRatio(latest.ratios.operatingCashFlowRatio),
    },
    {
      label: "Working Capital",
      score: subScore("workingCapital", capacity, risk),
      metricLabel: "Net working capital",
      metricValue:
        latest.workingCapital === null
          ? "—"
          : formatMoneyWhole(latest.workingCapital, report.currency),
    },
  ];
}

function DriverCard({ driver }: { driver: Driver }) {
  const condition = driverConditionFor(driver.score);
  const pct = driver.score === null ? 0 : Math.round(driver.score * 100);

  return (
    <Card size="sm" className="justify-between">
      <CardContent className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{driver.label}</p>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[11px]", BADGE_TONE[condition.tone])}
          >
            {condition.label}
          </Badge>
        </div>

        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {driver.score === null ? "—" : pct}
          </span>
          {driver.score !== null && (
            <span className="text-xs text-muted-foreground">/ 100</span>
          )}
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          {driver.score !== null && (
            <div
              className={cn("grow-in h-full rounded-full", BAR_TONE[condition.tone])}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-border pt-2.5">
          <span className="text-xs text-muted-foreground">{driver.metricLabel}</span>
          <span className="text-xs font-medium tabular-nums text-foreground">
            {driver.metricValue}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Financial Drivers — the five pillars underneath the headline scores, shown
 * as clean status cards (word + meter + one supporting metric). No engineering
 * weights, no raw sub-score decimals: the story a Risk Officer needs, nothing
 * they don't.
 */
export function FinancialDrivers({ report }: { report: FinancialIntelligenceReport }) {
  return (
    <section aria-label="Financial drivers">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Financial Drivers</h2>
        <p className="text-xs text-muted-foreground">
          Latest fiscal year (FY{report.latestYear})
        </p>
      </div>
      <div className="rise-in-stagger grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
        {buildDrivers(report).map((driver) => (
          <DriverCard key={driver.label} driver={driver} />
        ))}
      </div>
    </section>
  );
}
