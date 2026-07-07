import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { CapacityBand, ExecutionCapacity } from "@/lib/finance/types";

const BAND_STYLES: Record<CapacityBand, string> = {
  STRONG: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  MODERATE: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  LIMITED: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
};

const BAND_LABELS: Record<CapacityBand, string> = {
  STRONG: "Strong capacity",
  MODERATE: "Moderate capacity",
  LIMITED: "Limited capacity",
};

/**
 * Underwriting Capacity — the platform's primary KPI: hero score + fully
 * transparent component breakdown. Every number traces to a documented
 * deterministic rule — the breakdown IS the explanation, no narrative needed.
 */
export function CapacityCard({ capacity }: { capacity: ExecutionCapacity }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm">Underwriting Capacity</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Can the company financially execute this contract? Deterministic
            weighted score — see each component below.
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0", BAND_STYLES[capacity.band])}>
          {BAND_LABELS[capacity.band]}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
            {capacity.score}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
        </div>

        <ul className="mt-5 space-y-3">
          {capacity.components.map((component) => (
            <li key={component.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] text-foreground">{component.label}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    weight {component.weight}
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={1}
                  aria-valuenow={component.score ?? undefined}
                  aria-label={`${component.label} sub-score`}
                >
                  {component.score !== null && (
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(component.score * 100)}%` }}
                    />
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{component.detail}</p>
              </div>
              <span className="pt-0.5 text-[13px] font-medium tabular-nums text-foreground">
                {component.score === null ? "—" : component.score.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>

        {capacity.missingInputs.length > 0 && (
          <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Not scored (missing data, weights renormalized):{" "}
            {capacity.missingInputs.join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
