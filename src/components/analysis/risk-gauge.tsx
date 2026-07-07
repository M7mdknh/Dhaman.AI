import { AlertTriangle, CircleCheck, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { RiskAssessment, RiskBand } from "@/lib/finance/types";

const BAND_META: Record<
  RiskBand,
  { label: string; icon: typeof CircleCheck; badgeClass: string; fill: string }
> = {
  EXCELLENT: {
    label: "Excellent",
    icon: CircleCheck,
    badgeClass: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    fill: "var(--chart-1)",
  },
  LOW: {
    label: "Low risk",
    icon: CircleCheck,
    badgeClass: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    fill: "var(--chart-1)",
  },
  MODERATE: {
    label: "Moderate risk",
    icon: AlertTriangle,
    badgeClass: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
    fill: "var(--chart-3)",
  },
  HIGH: {
    label: "High risk",
    icon: ShieldAlert,
    badgeClass: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
    fill: "var(--chart-4)",
  },
  CRITICAL: {
    label: "Critical risk",
    icon: ShieldAlert,
    badgeClass: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
    fill: "var(--chart-4)",
  },
};

export interface GaugeMetric {
  label: string;
  value: string;
}

interface RiskGaugeProps {
  /** 0–100; higher = riskier. */
  score: number;
  band: RiskBand;
  /** Supporting metrics listed under the dial. */
  metrics?: GaugeMetric[];
  footnote?: string;
  className?: string;
}

/**
 * Reusable semicircular risk meter: score (0 = minimal risk, 100 = maximal),
 * band badge (icon + label — never color alone), and supporting metrics.
 * Pure SVG server component; the fill carries the band's severity, the
 * unfilled track stays neutral.
 */
export function RiskGauge({ score, band, metrics, footnote, className }: RiskGaugeProps) {
  const meta = BAND_META[band];
  const clamped = Math.max(0, Math.min(100, score));

  return (
    <div className={className}>
      <div className="relative mx-auto max-w-56">
        <svg
          viewBox="0 0 200 106"
          className="w-full"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clamped}
          aria-label={`Risk score ${clamped} of 100 — ${meta.label}`}
        >
          <path
            d="M 22 100 A 78 78 0 0 1 178 100"
            pathLength={100}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={12}
            strokeLinecap="round"
          />
          {clamped > 0 && (
            <path
              d="M 22 100 A 78 78 0 0 1 178 100"
              pathLength={100}
              fill="none"
              stroke={meta.fill}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${clamped} 100`}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-4xl font-semibold tracking-tight text-foreground">
            {clamped}
          </span>
          <span className="text-xs text-muted-foreground">/ 100 risk</span>
        </div>
      </div>

      <div className="mt-3 flex justify-center">
        <Badge variant="outline" className={cn("gap-1", meta.badgeClass)}>
          <meta.icon className="size-3" aria-hidden />
          {meta.label}
        </Badge>
      </div>

      {metrics && metrics.length > 0 && (
        <dl className="mt-5 space-y-1.5">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-baseline justify-between gap-3">
              <dt className="truncate text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {footnote && (
        <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {footnote}
        </p>
      )}
    </div>
  );
}

/**
 * The analysis dashboard's Risk Score panel: RiskGauge fed from a
 * RiskAssessment, with each weighted component as a supporting metric.
 * Secondary KPI by design — Underwriting Capacity leads the page.
 */
export function RiskScoreCard({ risk }: { risk: RiskAssessment }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Risk Score</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Deterministic weighted rules — 0 is minimal risk, 100 is maximal.
        </p>
      </CardHeader>
      <CardContent>
        <RiskGauge
          score={risk.score}
          band={risk.band}
          metrics={risk.components.map((c) => ({
            label: c.label,
            value: c.score === null ? "—" : c.score.toFixed(2),
          }))}
          footnote={
            risk.missingInputs.length > 0
              ? `Not scored (missing data, weights renormalized): ${risk.missingInputs.join(" · ")}`
              : undefined
          }
        />
      </CardContent>
    </Card>
  );
}
