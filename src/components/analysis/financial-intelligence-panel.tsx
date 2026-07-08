import { ExecutiveKpis } from "@/components/analysis/executive-kpis";
import { FinancialDrivers } from "@/components/analysis/financial-drivers";
import { FlagList } from "@/components/analysis/flag-list";
import { GrowthTable, RatioTables } from "@/components/analysis/ratio-tables";
import { TrendChart } from "@/components/analysis/trend-chart";
import { VerdictHero } from "@/components/analysis/verdict-hero";
import { deriveHeadline } from "@/lib/finance/headline";

import type { FinancialIntelligenceReport } from "@/lib/finance/types";

/** Trend charts required by the sprint spec, in display order. */
const CHARTED_TRENDS = [
  "revenue",
  "netIncome",
  "cash",
  "totalDebt",
  "workingCapital",
  "operatingCashFlow",
];

/**
 * The full deterministic Financial Intelligence dashboard body. Reads
 * top-down like an underwriting memo: the verdict (can we issue?), the three
 * executive KPIs, the five financial drivers, then the supporting evidence —
 * flags, trends, ratio tables. Shared by the contractor analysis page and the
 * officer review workspace; display only, every figure comes from the engines.
 */
export function FinancialIntelligencePanel({
  report,
}: {
  report: FinancialIntelligenceReport;
}) {
  const headline = deriveHeadline(report);

  return (
    <div className="space-y-8">
      {/* The verdict leads — it answers "can the bank issue this guarantee?". */}
      <VerdictHero headline={headline} />

      <ExecutiveKpis headline={headline} />

      <FinancialDrivers report={report} />

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
