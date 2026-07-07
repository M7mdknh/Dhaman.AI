import Link from "next/link";
import {
  AlertTriangle,
  CircleMinus,
  CirclePlus,
  FileText,
  Info,
  ListChecks,
  Sparkles,
} from "lucide-react";

import { GenerateDecisionButton } from "@/components/decision/generate-decision-button";
import {
  RecommendationBadge,
  recommendationLabel,
} from "@/components/decision/recommendation-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { DecisionIntelligence } from "@/generated/prisma/client";

/** Provenance chip: this content came from the model, not the engines. */
export function AiDraftedBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-border bg-muted text-muted-foreground">
      <Sparkles className="size-3" aria-hidden />
      AI-drafted
    </Badge>
  );
}

function TextItemList({
  items,
  icon: Icon,
  iconClass,
}: {
  items: string[];
  icon: typeof CirclePlus;
  iconClass: string;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
          <Icon className={cn("mt-0.5 size-3.5 shrink-0", iconClass)} aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Case-page Decision Intelligence panel. Renders the persisted, validated
 * memo — no provider logic, no prompt logic. The recommendation shown is
 * bank policy (deterministic); the AI only explains it.
 */
export function DecisionSection({
  caseId,
  decision,
  eligible,
}: {
  caseId: string;
  decision: DecisionIntelligence | null;
  /** Case is submitted with parsed statements — generation is possible. */
  eligible: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm">Decision Intelligence</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            AI-drafted underwriting memo over the deterministic analysis. The
            final decision always rests with the Risk Officer.
          </p>
        </div>
        {decision && <RecommendationBadge recommendation={decision.recommendation} />}
      </CardHeader>
      <CardContent>
        {!decision ? (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-foreground">
              No underwriting analysis yet
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {eligible
                ? "Generate an AI-drafted memo that explains the computed financial intelligence. Nothing is calculated by the AI."
                : "The memo becomes available once the case is submitted and its statements are parsed."}
            </p>
            {eligible && (
              <div className="mt-4">
                <GenerateDecisionButton caseId={caseId} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {decision.provider === "mock" && (
              <p className="flex gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                No AI provider is configured — this memo was assembled by the
                deterministic template provider. Set OPENAI_API_KEY for an
                AI-drafted narrative.
              </p>
            )}
            {decision.aiDiverged && (
              <p className="flex gap-2 rounded-lg border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                The model suggested “{recommendationLabel(decision.aiRecommendation)}”, but bank
                policy for this risk band is “{recommendationLabel(decision.recommendation)}”.
                Policy is shown; review the divergence.
              </p>
            )}

            <section aria-label="Executive summary">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-semibold text-foreground">Executive Summary</h3>
                <AiDraftedBadge />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {decision.summary}
              </p>
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              <section aria-label="Strengths">
                <h3 className="mb-2 text-[13px] font-semibold text-foreground">Strengths</h3>
                <TextItemList
                  items={decision.companyStrengths}
                  icon={CirclePlus}
                  iconClass="text-emerald-700 dark:text-emerald-400"
                />
              </section>
              <section aria-label="Weaknesses">
                <h3 className="mb-2 text-[13px] font-semibold text-foreground">Weaknesses</h3>
                <TextItemList
                  items={decision.companyWeaknesses}
                  icon={CircleMinus}
                  iconClass="text-red-700 dark:text-red-400"
                />
              </section>
            </div>

            <section
              aria-label="Recommendation"
              className="rounded-lg border border-border bg-muted/40 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-semibold text-foreground">Recommendation</h3>
                <RecommendationBadge recommendation={decision.recommendation} />
                <Badge variant="outline" className="border-border bg-card text-muted-foreground">
                  Derived from the computed risk band
                </Badge>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {decision.recommendationReason}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Confidence:</span>{" "}
                {decision.confidenceExplanation}
              </p>
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              <section aria-label="Missing information">
                <h3 className="mb-2 text-[13px] font-semibold text-foreground">
                  Missing Information
                </h3>
                <TextItemList
                  items={decision.missingInformation}
                  icon={Info}
                  iconClass="text-muted-foreground"
                />
              </section>
              <section aria-label="Next steps">
                <h3 className="mb-2 text-[13px] font-semibold text-foreground">Next Steps</h3>
                <TextItemList
                  items={decision.nextSteps}
                  icon={ListChecks}
                  iconClass="text-muted-foreground"
                />
              </section>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-[11px] text-muted-foreground">
                Generated {formatDateTime(decision.createdAt)} · {decision.provider} ·{" "}
                {decision.model} · prompt {decision.promptVersion}
                {decision.latencyMs !== null && <> · {(decision.latencyMs / 1000).toFixed(1)}s</>}
              </p>
              <div className="flex items-center gap-2">
                <GenerateDecisionButton caseId={caseId} regenerate />
                <Link
                  href={`/cases/${caseId}/package`}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  <FileText className="size-4" aria-hidden />
                  Underwriting Package
                </Link>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
