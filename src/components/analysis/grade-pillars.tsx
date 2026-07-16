import { ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BADGE_TONE, BAR_TONE, RISK_META } from "@/lib/finance/display";
import { cn } from "@/lib/utils";

import type {
  FinancialIntelligenceReport,
  PillarAssessment,
  ScoreComponent,
} from "@/lib/finance/types";

function PillarCard({
  label,
  weight,
  score,
  band,
  absentNote,
}: {
  label: string;
  weight: number;
  score: number | null;
  band: FinancialIntelligenceReport["overall"]["band"] | null;
  absentNote: string;
}) {
  const meta = band ? RISK_META[band] : null;
  return (
    <Card size="sm">
      <CardContent className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[11px]", meta ? BADGE_TONE[meta.tone] : BADGE_TONE.neutral)}
          >
            {meta ? meta.label : "Not provided"}
          </Badge>
        </div>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {score === null ? "—" : score}
          </span>
          {score !== null && <span className="text-xs text-muted-foreground">/ 100 risk</span>}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          {score !== null && meta && (
            <div
              className={cn("grow-in h-full rounded-full", BAR_TONE[meta.tone])}
              style={{ width: `${Math.max(4, 100 - score)}%` }}
            />
          )}
        </div>
        <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
          {score === null ? absentNote : `${weight}% of the overall grade`}
        </p>
      </CardContent>
    </Card>
  );
}

function ComponentRows({ components }: { components: ScoreComponent[] }) {
  return (
    <ul className="divide-y divide-border">
      {components.map((component) => (
        <li key={component.key} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">{component.label}</p>
            <p className="truncate text-xs text-muted-foreground">{component.detail}</p>
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {component.score === null ? "n/a" : `${Math.round(component.score * 100)} / 100`}
            <span className="ml-1 text-muted-foreground/70">· w{component.weight}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function PillarBreakdown({ title, pillar }: { title: string; pillar: PillarAssessment }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="mb-1 text-sm font-medium text-foreground">{title}</p>
        <ComponentRows components={pillar.components} />
        {pillar.missingInputs.length > 0 && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            Excluded (missing inputs): {pillar.missingInputs.join(", ")} — weights renormalized.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The composite grade behind the verdict: the three deterministic pillars
 * (financial / qualitative / contract), any hard caps that constrained the
 * recommendation, and the statement-reliability confidence. Every number is
 * engine output — display only.
 */
export function GradePillars({ report }: { report: FinancialIntelligenceReport }) {
  const { overall } = report;
  const [financial, qualitative, contractRisk] = overall.pillars;

  return (
    <section aria-label="Underwriting grade pillars" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Underwriting Grade</h2>
        <p className="text-xs text-muted-foreground">
          {overall.confidenceDetail} Confidence: {overall.confidence.toLowerCase()}.
        </p>
      </div>

      {overall.caps.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <p className="text-sm font-semibold text-foreground">
              Recommendation capped at {overall.recommendation.replaceAll("_", " ").toLowerCase()}
              {overall.uncappedRecommendation !== overall.recommendation &&
                ` (the grade alone would say ${overall.uncappedRecommendation
                  .replaceAll("_", " ")
                  .toLowerCase()})`}
            </p>
          </div>
          <ul className="mt-2 space-y-1 pl-6">
            {overall.caps.map((cap) => (
              <li key={cap.type} className="list-disc text-xs leading-relaxed text-muted-foreground">
                {cap.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rise-in-stagger grid gap-4 @lg:grid-cols-3">
        <PillarCard
          label="Financial Health"
          weight={financial.weight}
          score={financial.score}
          band={financial.band}
          absentNote="No parsed statements"
        />
        <PillarCard
          label="Company Qualitative (KYC)"
          weight={qualitative.weight}
          score={qualitative.score}
          band={qualitative.band}
          absentNote="This case predates the KYC questionnaire"
        />
        <PillarCard
          label="Contract Risk"
          weight={contractRisk.weight}
          score={contractRisk.score}
          band={contractRisk.band}
          absentNote="This case predates the structured contract form"
        />
      </div>

      {(report.qualitative || report.contractRisk) && (
        <div className="grid gap-4 @3xl:grid-cols-2">
          {report.qualitative && (
            <PillarBreakdown title="Qualitative components" pillar={report.qualitative} />
          )}
          {report.contractRisk && (
            <PillarBreakdown title="Contract risk components" pillar={report.contractRisk} />
          )}
        </div>
      )}
    </section>
  );
}
