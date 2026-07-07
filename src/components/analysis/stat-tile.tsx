import { cn } from "@/lib/utils";

export type DeltaSentiment = "positive" | "negative" | "neutral";

const SENTIMENT_CLASSES: Record<DeltaSentiment, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-red-700 dark:text-red-400",
  neutral: "text-muted-foreground",
};

interface StatTileProps {
  label: string;
  /** Pre-formatted display value ("2.33", "11.7%", "—"). */
  value: string;
  /** Signed change vs a named period; sentiment = is this move good or bad? */
  delta?: { text: string; sentiment: DeltaSentiment } | null;
  /** Comparison period or metric definition, e.g. "vs FY2024". */
  hint?: string;
}

/** KPI tile: label, headline value, and a sentiment-coded YoY delta. */
export function StatTile({ label, value, delta, hint }: StatTileProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs">
        {delta && (
          <span className={cn("font-medium tabular-nums", SENTIMENT_CLASSES[delta.sentiment])}>
            {delta.text}
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </p>
    </div>
  );
}
