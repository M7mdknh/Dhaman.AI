"use client";

import { RecommendationBadge } from "@/components/decision/recommendation-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { UnderwritingHeadline } from "@/lib/finance/headline";
import type { CapacityBand, RiskBand } from "@/lib/finance/types";

const RISK_LABEL: Record<RiskBand, string> = {
  EXCELLENT: "Excellent",
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
  CRITICAL: "Critical",
};
const RISK_TONE: Record<RiskBand, string> = {
  EXCELLENT: "emerald",
  LOW: "emerald",
  MODERATE: "amber",
  HIGH: "red",
  CRITICAL: "red",
};
const CAPACITY_LABEL: Record<CapacityBand, string> = {
  STRONG: "Strong",
  MODERATE: "Moderate",
  LIMITED: "Limited",
};

/** emerald / amber / red → the token classes used across the analysis UI. */
const TONE: Record<string, string> = {
  emerald: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  amber: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  red: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
};

function ratingTone(rating: string): string {
  if (["AAA", "AA", "A"].includes(rating)) return "emerald";
  if (["BBB", "BB"].includes(rating)) return "amber";
  return "red";
}

function ScoreTile({ label, score, tone }: { label: string; score: number | null; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {score === null ? (
        <p className="mt-1 text-sm text-muted-foreground">—</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {score}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", {
                "bg-emerald-500": tone === "emerald",
                "bg-amber-500": tone === "amber",
                "bg-red-500": tone === "red",
              })}
              style={{ width: `${score}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The Stage-1 "wow" — the underwriting verdict shown the instant deterministic
 * analysis completes, before the AI memo. Every value here is deterministic
 * (from the Financial Intelligence Engine); the AI never computes these.
 */
export function UnderwritingHeadlineCard({ headline }: { headline: UnderwritingHeadline }) {
  const riskTone = RISK_TONE[headline.riskBand];
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <ScoreTile
          label="Underwriting Capacity"
          score={headline.capacityScore}
          tone={
            headline.capacityBand === "STRONG"
              ? "emerald"
              : headline.capacityBand === "MODERATE"
                ? "amber"
                : "red"
          }
        />

        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rating</p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums",
              ratingTone(headline.rating) === "emerald" && "text-emerald-600 dark:text-emerald-400",
              ratingTone(headline.rating) === "amber" && "text-amber-600 dark:text-amber-400",
              ratingTone(headline.rating) === "red" && "text-red-600 dark:text-red-400",
            )}
          >
            {headline.rating}
          </p>
          {headline.capacityBand && (
            <p className="mt-1 text-xs text-muted-foreground">{CAPACITY_LABEL[headline.capacityBand]} capacity</p>
          )}
        </div>

        <ScoreTile label="Financial Health" score={headline.healthScore} tone={riskTone} />

        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Risk Level</p>
          <Badge variant="outline" className={cn("mt-2 gap-1", TONE[riskTone])}>
            {RISK_LABEL[headline.riskBand]}
          </Badge>
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">Risk score {headline.riskScore}/100</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recommendation</p>
          <div className="mt-2">
            <RecommendationBadge recommendation={headline.recommendation} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Preliminary — subject to Risk Officer review.</p>
        </div>
      </div>
    </div>
  );
}
