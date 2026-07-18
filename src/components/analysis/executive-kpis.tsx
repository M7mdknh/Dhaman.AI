import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  BADGE_TONE,
  BAR_TONE,
  CAPACITY_META,
  conditionFor,
  RISK_META,
  type Condition,
} from "@/lib/finance/display";
import { cn } from "@/lib/utils";

import type { UnderwritingHeadline } from "@/lib/finance/headline";

/** A single executive KPI card: score /100, a status badge, and a meter. */
function KpiCard({
  label,
  score,
  status,
  caption,
  /** 0–100 meter fill; defaults to the score. */
  fill,
  emptyHint,
}: {
  label: string;
  score: number | null;
  status: Condition;
  caption: string;
  fill?: number | null;
  emptyHint?: string;
}) {
  const meter = fill ?? score;

  return (
    <Card className="justify-between">
      <CardContent className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Badge variant="outline" className={cn("shrink-0", BADGE_TONE[status.tone])}>
            {status.label}
          </Badge>
        </div>

        {score === null ? (
          <div className="mt-4 flex flex-1 flex-col justify-end">
            <p className="font-display text-3xl font-light text-muted-foreground">—</p>
            <p className="mt-2 text-xs text-muted-foreground">{emptyHint ?? caption}</p>
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-display text-6xl font-light tabular-nums tracking-tight text-foreground">
                <AnimatedNumber value={score} />
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("grow-in h-full rounded-full transition-all", BAR_TONE[status.tone])}
                style={{ width: `${Math.max(0, Math.min(100, meter ?? 0))}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{caption}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The three headline KPIs a credit committee reads first: how much this
 * company can execute (capacity), how sound it is (financial health), and how
 * much risk it carries. Every figure is deterministic — sourced from the
 * engine via the underwriting headline, never recomputed here.
 */
export function ExecutiveKpis({ headline }: { headline: UnderwritingHeadline }) {
  const capacityStatus = headline.capacityBand
    ? CAPACITY_META[headline.capacityBand]
    : { label: "Awaiting contract", tone: "neutral" as const };
  const healthStatus = conditionFor(headline.healthScore);
  const riskStatus = RISK_META[headline.riskBand];

  // Container query: the panel renders in both the wide analysis page and the
  // narrower review column — column count follows the available width, not the viewport.
  return (
    <section aria-label="Executive summary" className="rise-in-stagger grid gap-5 @2xl:grid-cols-3">
      <KpiCard
        label="Underwriting Capacity"
        score={headline.capacityScore}
        status={capacityStatus}
        caption={`Rating ${headline.rating} · can execute this contract`}
        emptyHint="Add contract details to size execution capacity."
      />
      <KpiCard
        label="Financial Health"
        score={headline.healthScore}
        status={healthStatus}
        caption={`Overall financial condition: ${healthStatus.label.toLowerCase()}`}
      />
      <KpiCard
        label="Risk Level"
        score={headline.riskScore}
        status={riskStatus}
        caption={`${riskStatus.label} · 0 is safest, 100 is highest risk`}
      />
    </section>
  );
}
