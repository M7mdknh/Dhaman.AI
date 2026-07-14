import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TimelineEntry {
  label: string;
  /** Formatted timestamp; omit for upcoming stages. */
  timestamp?: string;
  state: "complete" | "upcoming";
}

/**
 * Vertical case lifecycle timeline. Grows sprint by sprint — callers append
 * entries (Financial Analysis, AI Underwriter, Officer Review, …) as those
 * stages ship; upcoming stages render muted.
 */
export function CaseTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="rise-in-stagger space-y-0">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const complete = entry.state === "complete";
        return (
          <li key={entry.label} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-border"
                aria-hidden
              />
            )}
            <span
              className={cn(
                "mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full border",
                complete
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background",
              )}
              aria-hidden
            >
              {complete && <Check className="size-3" strokeWidth={3} />}
            </span>
            <div className="min-w-0 pt-0.5">
              <p
                className={cn(
                  "text-sm font-medium leading-tight",
                  complete ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {entry.label}
              </p>
              {entry.timestamp ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{entry.timestamp}</p>
              ) : (
                !complete && <p className="mt-0.5 text-xs text-muted-foreground/70">Upcoming</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
