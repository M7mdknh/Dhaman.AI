import { ExecutiveKpis } from "@/components/analysis/executive-kpis";
import { FinancialDrivers } from "@/components/analysis/financial-drivers";
import { FlagList } from "@/components/analysis/flag-list";
import { GradePillars } from "@/components/analysis/grade-pillars";
import { GrowthTable, RatioTables } from "@/components/analysis/ratio-tables";
import { TrendChart } from "@/components/analysis/trend-chart";
import { ValidationReport } from "@/components/analysis/validation-report";
import { VerdictHero } from "@/components/analysis/verdict-hero";
import { buildValidationReport, needsValidationReport } from "@/lib/finance/confidence";
import { deriveHeadline } from "@/lib/finance/headline";

import type { FinancialIntelligenceReport } from "@/lib/finance/types";
import type { IntegrityReport } from "@/services/finance/financial-integrity-validator";

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
 * The six charted metrics. Working capital is undefined for statements with
 * no current/non-current split (order-of-liquidity presentations) — an empty
 * chart teaches the reader nothing, so Total Equity (always on the balance
 * sheet) takes its slot instead of a blank card.
 */
function chartedTrendKeys(report: FinancialIntelligenceReport): string[] {
  const workingCapital = report.trends.find((t) => t.key === "workingCapital");
  const hasWorkingCapital = workingCapital?.series.some((p) => p.value !== null) ?? false;
  return CHARTED_TRENDS.map((key) =>
    key === "workingCapital" && !hasWorkingCapital ? "totalEquity" : key,
  );
}

/**
 * The full deterministic Financial Intelligence dashboard body. Reads
 * top-down like an underwriting memo: the verdict (can we issue?), the three
 * executive KPIs, the five financial drivers, then the supporting evidence —
 * flags, trends, ratio tables. Shared by the contractor analysis page and the
 * officer review workspace; display only, every figure comes from the engines.
 */
export function FinancialIntelligencePanel({
  report,
  integrity,
  unreadYears = [],
}: {
  report: FinancialIntelligenceReport;
  /**
   * The Financial Integrity Validator's verdict on the statements behind this
   * report. Optional only so hosts without it still render; every host that
   * has the statements should pass it — a verdict shown without its
   * confidence is exactly what this feature exists to prevent.
   */
  integrity?: IntegrityReport | null;
  /**
   * Fiscal years whose uploaded statement failed extraction and so contributed
   * nothing to this report. Historical statements are optional — an unread one
   * limits trend analysis (confidence: Medium) but never blocks the verdict.
   */
  unreadYears?: number[];
}) {
  const headline = deriveHeadline(report);
  const validation = integrity ? buildValidationReport(integrity, unreadYears) : null;
  const showReport = integrity ? needsValidationReport(integrity, unreadYears) : false;

  // @container: the panel is shared by the wide contractor analysis page and
  // the narrower officer review column — its internal grids (KPIs, drivers,
  // trends, ratio tables) respond to the panel's own width via container
  // queries so neither host ever crushes them.
  return (
    <div className="@container space-y-8">
      {/* The verdict leads — it answers "can the bank issue this guarantee?". */}
      <div className="rise-in">
        <VerdictHero
          headline={headline}
          confidence={validation?.confidence}
          hasValidationReport={showReport}
        />
      </div>

      {/* Immediately under the verdict it qualifies: a reader must meet the
          caveat before the figures, not after scrolling past them. */}
      {validation && showReport && (
        <div className="rise-in">
          <ValidationReport report={validation} />
        </div>
      )}

      <ExecutiveKpis headline={headline} />

      {/* The composite grade behind the verdict: three pillars + hard caps. */}
      <div className="scroll-reveal">
        <GradePillars report={report} />
      </div>

      <div className="scroll-reveal">
        <FinancialDrivers report={report} />
      </div>

      <div className="scroll-reveal">
        <FlagList flags={report.flags} currency={report.currency} />
      </div>

      <section aria-label="Financial trends" className="scroll-reveal">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Trends</h2>
        {unreadYears.length > 0 ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Trend analysis is limited — the {unreadYears.map((y) => `FY${y}`).join(", ")}{" "}
            statement{unreadYears.length === 1 ? "" : "s"} could not be verified, so the
            charts cover the verified years only.
          </p>
        ) : report.years.length < 2 ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Only one fiscal year is available — year-over-year comparisons
            need at least two.
          </p>
        ) : null}
        <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3">
          {chartedTrendKeys(report).map((key) => {
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

      <section aria-label="Financial ratios" className="scroll-reveal space-y-6">
        <h2 className="text-sm font-semibold text-foreground">Financial Ratios</h2>
        <RatioTables
          ratiosByYear={report.ratiosByYear}
          currency={report.currency}
          orderOfLiquidity={report.disclosures.orderOfLiquidity}
        />
        <GrowthTable periods={report.growthPeriods} />
      </section>
    </div>
  );
}
