import { AlertTriangle, CheckCircle2, Search, XCircle } from "lucide-react";

import { ConfidenceBadge } from "@/components/analysis/confidence-badge";
import { VALIDATION_REPORT_ID } from "@/components/analysis/validation-report";
import { recommendationLabel } from "@/components/decision/recommendation-badge";
import { SURFACE_TONE, TEXT_TONE, VERDICT_META } from "@/lib/finance/display";
import { cn } from "@/lib/utils";

import type { ConfidenceMeta } from "@/lib/finance/confidence";
import type { UnderwritingHeadline } from "@/lib/finance/headline";
import type { RecommendationType } from "@/generated/prisma/client";

const VERDICT_ICON: Record<RecommendationType, typeof CheckCircle2> = {
  APPROVE: CheckCircle2,
  APPROVE_WITH_CONDITIONS: AlertTriangle,
  MANUAL_REVIEW: Search,
  REJECT: XCircle,
};

/**
 * The dashboard's dominant element: it answers "Can the bank issue this
 * guarantee?" at a glance. The verdict is the bank-policy recommendation
 * (derived deterministically from the risk band) — never the AI's, and always
 * preliminary until a Risk Officer signs off.
 */
export function VerdictHero({
  headline,
  confidence,
  hasValidationReport = false,
}: {
  headline: UnderwritingHeadline;
  /** How far this verdict can be trusted. Always shown beside it. */
  confidence?: ConfidenceMeta;
  /** True when the validator raised something worth reading. */
  hasValidationReport?: boolean;
}) {
  const verdict = VERDICT_META[headline.recommendation];
  const Icon = VERDICT_ICON[headline.recommendation];

  return (
    <section
      aria-label="Underwriting verdict"
      className={cn(
        "rounded-2xl border p-6 sm:p-8",
        SURFACE_TONE[verdict.tone],
      )}
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Can the bank issue this guarantee?
          </p>
          <div className="reveal-stamp mt-3 flex items-center gap-3">
            <span className={cn("shrink-0", TEXT_TONE[verdict.tone])}>
              <Icon className="size-8 sm:size-9" aria-hidden />
            </span>
            <h1
              className={cn(
                "font-display text-4xl font-light leading-none tracking-tight sm:text-5xl",
                TEXT_TONE[verdict.tone],
              )}
            >
              {verdict.answer}
            </h1>
          </div>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Preliminary recommendation of record —{" "}
            <span className="font-medium text-foreground">
              {recommendationLabel(headline.recommendation)}
            </span>
            . Derived from bank policy; the final decision belongs to the Risk
            Officer.
          </p>

          {/* The verdict never travels without its confidence — a reader must
              not have to look elsewhere to learn the figures behind it were
              incomplete. */}
          {confidence && (
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <ConfidenceBadge confidence={confidence} />
              {hasValidationReport && (
                <a
                  href={`#${VALIDATION_REPORT_ID}`}
                  className="text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                  Review Validation Report
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-6 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Company rating
            </p>
            <p
              className={cn(
                "reveal-stamp-right font-display text-5xl font-light tabular-nums leading-none sm:text-6xl",
                TEXT_TONE[verdict.tone],
              )}
            >
              {headline.rating}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
