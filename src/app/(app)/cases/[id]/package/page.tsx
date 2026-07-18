import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calculator, Download } from "lucide-react";

import { FlagList } from "@/components/analysis/flag-list";
import { GrowthTable } from "@/components/analysis/ratio-tables";
import {
  CompanySummary,
  ContractSummary,
} from "@/components/cases/summary-sections";
import { AiDraftedBadge } from "@/components/decision/decision-section";
import {
  RecommendationBadge,
  recommendationLabel,
} from "@/components/decision/recommendation-badge";
import { PrintButton } from "@/components/decision/print-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/analysis/confidence-badge";
import { getSession } from "@/lib/auth/session";
import { toCompanyInput, toContractInput } from "@/lib/case-view";
import { buildValidationReport, needsValidationReport } from "@/lib/finance/confidence";
import { formatDateTime, formatMoney, formatPercent, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCaseForReview } from "@/services/officer-case-service";
import { validateFinancialIntegrity } from "@/services/finance/financial-integrity-validator";
import {
  buildFinancialIntelligence,
  toIdentityInputs,
} from "@/services/finance/financial-intelligence-service";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Underwriting Package" };

/** Provenance chip: this content was computed by the deterministic engines. */
function ComputedBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-border bg-muted text-muted-foreground">
      <Calculator className="size-3" aria-hidden />
      Computed
    </Badge>
  );
}

function ReportSection({
  title,
  provenance,
  children,
}: {
  title: string;
  provenance: "computed" | "ai" | "both";
  children: ReactNode;
}) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        <span className="flex gap-1.5">
          {(provenance === "computed" || provenance === "both") && <ComputedBadge />}
          {(provenance === "ai" || provenance === "both") && <AiDraftedBadge />}
        </span>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default async function UnderwritingPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Bank-internal report (Sprint 5): the memo and package are officer-only.
  if (session.role === "CONTRACTOR") notFound();

  const { id } = await params;
  const underwritingCase = await getCaseForReview(session.userId, id);
  if (!underwritingCase) notFound();

  const decision = underwritingCase.decisionIntelligence[0] ?? null;
  if (!decision || !underwritingCase.contractDetails) redirect(`/review/${id}`);

  const report = buildFinancialIntelligence(
    underwritingCase.financialStatements,
    underwritingCase.contractDetails,
    toIdentityInputs(underwritingCase.company.name, underwritingCase.documents),
    underwritingCase.qualitative,
    underwritingCase.company.sector,
  );
  if (!report) redirect(`/cases/${id}`);
  const integrity = validateFinancialIntegrity(underwritingCase.financialStatements);
  // Statements that FAILED extraction never reached the validator; they cap
  // confidence at Medium and explain the limited trend analysis honestly.
  const unreadYears = underwritingCase.documents
    .filter(
      (d) =>
        d.docType === "FINANCIAL_STATEMENT" &&
        d.processingStatus === "FAILED" &&
        d.fiscalYear !== null &&
        !underwritingCase.financialStatements.some((s) => s.fiscalYear === d.fiscalYear),
    )
    .map((d) => d.fiscalYear!)
    .sort((a, b) => b - a);
  const validation = buildValidationReport(integrity, unreadYears);

  const latestRatios = report.ratiosByYear.at(-1)!;
  const revenueGrowth = report.growthPeriods.at(-1)?.growth.revenueGrowth ?? null;
  const highlights: { label: string; value: string }[] = [
    {
      label: "Underwriting Capacity",
      value: report.capacity ? `${report.capacity.score}/100 · ${report.capacity.band}` : "—",
    },
    { label: "Overall Grade", value: `${report.overall.score}/100 · ${report.overall.band}` },
    {
      label: "Company Qualitative",
      value: report.qualitative
        ? `${report.qualitative.score}/100 · ${report.qualitative.band}`
        : "—",
    },
    {
      label: "Contract Risk",
      value: report.contractRisk
        ? `${report.contractRisk.score}/100 · ${report.contractRisk.band}`
        : "—",
    },
    { label: "Current Ratio", value: formatRatio(latestRatios.ratios.currentRatio) },
    { label: "Debt-to-Equity", value: formatRatio(latestRatios.ratios.debtToEquity) },
    { label: "Net Profit Margin", value: formatPercent(latestRatios.ratios.netMargin) },
    { label: "Operating Cash Flow Ratio", value: formatRatio(latestRatios.ratios.operatingCashFlowRatio) },
    { label: "Revenue Growth (YoY)", value: formatPercent(revenueGrowth) },
    {
      label: "Working Capital",
      value:
        latestRatios.workingCapital === null
          ? "—"
          : formatMoney(latestRatios.workingCapital, report.currency),
    },
  ];

  const trendLines = report.trends
    .filter((t) => t.direction !== null)
    .map((t) => {
      const change = t.yoyChanges.at(-1)?.changePct ?? null;
      const changeText =
        change === null
          ? ""
          : t.unit === "money"
            ? ` (${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}% YoY)`
            : ` (${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}pp YoY)`;
      return `${t.label}: ${t.direction!.toLowerCase()}${changeText}`;
    });

  const engineMissing = [
    ...(report.capacity?.missingInputs ?? []),
    ...report.risk.missingInputs,
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link
            href={`/review/${id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {underwritingCase.reference}
          </Link>
          <h1 className="font-display mt-2 text-2xl font-light tracking-tight text-foreground sm:text-3xl">
            Underwriting Package
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/cases/${id}/package-pdf`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Download className="size-4" aria-hidden />
            Download PDF
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Report letterhead */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Daman — Corporate Underwriting
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
              {underwritingCase.company.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {underwritingCase.contractDetails.contractTitle}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right text-xs text-muted-foreground">
            <ConfidenceBadge confidence={validation.confidence} />
            <div>
              <p className="font-medium text-foreground">{underwritingCase.reference}</p>
              <p>Generated {formatDateTime(decision.createdAt)}</p>
              <p>
                {decision.provider} · {decision.model} · prompt {decision.promptVersion}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          All figures are computed deterministically from the audited IFRS
          statements. AI-drafted sections explain those figures — the AI never
          calculates and never decides. The final decision rests with the Risk
          Officer.
        </p>
        {/* This package is printed, filed, and re-read months later to justify
            a decision. Any caveat on the figures must travel WITH it. */}
        {needsValidationReport(integrity) && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Assessment confidence:</span>{" "}
            {validation.summary}
          </p>
        )}
      </div>

      <ReportSection title="Executive Summary" provenance="ai">
        <p className="text-[13px] leading-relaxed text-muted-foreground">{decision.summary}</p>
      </ReportSection>

      <div className="grid gap-6 md:grid-cols-2">
        <ReportSection title="Company Overview" provenance="computed">
          <CompanySummary company={toCompanyInput(underwritingCase.company)} />
        </ReportSection>
        <ReportSection title="Contract Overview" provenance="computed">
          <ContractSummary contract={toContractInput(underwritingCase.contractDetails)} />
        </ReportSection>
      </div>

      <ReportSection title="Financial Highlights" provenance="computed">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {highlights.map((h) => (
            <div key={h.label} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
              <dt className="text-[13px] text-muted-foreground">{h.label}</dt>
              <dd className="text-[13px] font-medium tabular-nums text-foreground">{h.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Latest fiscal year (FY{report.latestYear}). Full ratio tables and
          trend charts: Financial Analysis page.
        </p>
      </ReportSection>

      <ReportSection title="Major Risks" provenance="both">
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
              Risk narrative <AiDraftedBadge />
            </h4>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {decision.riskExplanation}
            </p>
          </div>
          {decision.companyWeaknesses.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
                Weaknesses <AiDraftedBadge />
              </h4>
              <BulletList items={decision.companyWeaknesses} />
            </div>
          )}
          <FlagList flags={report.flags} currency={report.currency} />
        </div>
      </ReportSection>

      <ReportSection title="Positive Indicators" provenance="ai">
        <BulletList items={decision.companyStrengths} />
      </ReportSection>

      <ReportSection title="Financial Trends" provenance="computed">
        {trendLines.length > 0 ? (
          <BulletList items={trendLines} />
        ) : unreadYears.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Trend analysis is unavailable — the{" "}
            {unreadYears.map((y) => `FY${y}`).join(", ")} statement
            {unreadYears.length === 1 ? "" : "s"} could not be verified, so the
            assessment rests on the verified latest year alone.
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Year-over-year trends need at least two fiscal years.
          </p>
        )}
        <div className="mt-4">
          <GrowthTable periods={report.growthPeriods} />
        </div>
      </ReportSection>

      <ReportSection title="Recommendation" provenance="both">
        <div className="flex flex-wrap items-center gap-2">
          <RecommendationBadge recommendation={decision.recommendation} />
          <span className="text-xs text-muted-foreground">
            Derived deterministically from risk band {report.risk.band} — never by the AI.
          </span>
        </div>
        {decision.aiDiverged && (
          <p className="mt-3 rounded-lg border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            The model suggested “{recommendationLabel(decision.aiRecommendation)}” — bank policy
            prevails; review the divergence.
          </p>
        )}
        <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-muted-foreground">
          <p>{decision.recommendationReason}</p>
          <p>
            <span className="font-medium text-foreground">Confidence:</span>{" "}
            {decision.confidenceExplanation}
          </p>
        </div>
        <div className="mt-4">
          <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
            Next steps <AiDraftedBadge />
          </h4>
          <BulletList items={decision.nextSteps} />
        </div>
      </ReportSection>

      <ReportSection title="Missing Information" provenance="both">
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
              Identified by the memo <AiDraftedBadge />
            </h4>
            <BulletList items={decision.missingInformation} />
          </div>
          {engineMissing.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
                Engine inputs not computable <ComputedBadge />
              </h4>
              <BulletList items={[...new Set(engineMissing)]} />
            </div>
          )}
        </div>
      </ReportSection>
    </div>
  );
}
