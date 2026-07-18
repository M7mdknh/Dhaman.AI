import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TimelineEntry {
  label: string;
  /** Formatted timestamp; omit for upcoming stages. */
  timestamp?: string;
  /** One-line context under the label — who acted, or what happens in this stage. */
  description?: string;
  /** `skipped` = stage will never happen (e.g. no guarantee on a declined case). */
  state: "complete" | "upcoming" | "skipped";
}

type ResolvedState = TimelineEntry["state"] | "current";

/**
 * Vertical case lifecycle timeline. The answer to "what happened, what is
 * happening now, what happens next": completed stages are checked off, the
 * single active stage (the first upcoming one) is highlighted as current,
 * and later stages stay muted. Callers only mark complete/upcoming/skipped —
 * the current stage is derived, so the two can never disagree.
 */
export function CaseTimeline({ entries }: { entries: TimelineEntry[] }) {
  const currentIndex = entries.findIndex((e) => e.state === "upcoming");

  return (
    <ol className="rise-in-stagger space-y-0">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const state: ResolvedState = index === currentIndex ? "current" : entry.state;
        const complete = state === "complete";
        const current = state === "current";
        const skipped = state === "skipped";
        // The connector below this node: solid brand color through completed
        // work, faint for everything still ahead.
        const connectorDone = complete;

        return (
          <li key={entry.label} className="relative flex gap-3.5 pb-7 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  "absolute left-[11px] top-[26px] h-[calc(100%-22px)] w-px",
                  connectorDone ? "bg-primary/60" : "bg-border",
                )}
                aria-hidden
              />
            )}

            <span
              className={cn(
                "relative mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full border",
                complete && "border-primary bg-primary text-primary-foreground",
                current && "border-primary bg-background",
                skipped && "border-border bg-muted/50 text-muted-foreground/50",
                state === "upcoming" && "border-border bg-background",
              )}
              aria-hidden
            >
              {complete && <Check className="size-3" strokeWidth={3} />}
              {current && (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full border border-primary/40" />
                  <span className="size-2 rounded-full bg-primary" />
                </>
              )}
              {skipped && <Minus className="size-3" strokeWidth={2.5} />}
              {state === "upcoming" && (
                <span className="size-1.5 rounded-full bg-muted-foreground/30" />
              )}
            </span>

            <div className="min-w-0 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p
                  className={cn(
                    "text-sm leading-tight",
                    complete && "font-medium text-foreground",
                    current && "font-semibold text-foreground",
                    skipped && "text-muted-foreground/60 line-through decoration-muted-foreground/40",
                    state === "upcoming" && "font-medium text-muted-foreground",
                  )}
                >
                  {entry.label}
                </p>
                {current && (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                    In progress
                  </span>
                )}
              </div>
              {entry.timestamp ? (
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {entry.timestamp}
                </p>
              ) : current ? (
                entry.description && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {entry.description}
                  </p>
                )
              ) : skipped ? (
                <p className="mt-1 text-xs text-muted-foreground/60">
                  {entry.description ?? "Not applicable"}
                </p>
              ) : (
                state === "upcoming" && (
                  <p className="mt-1 text-xs text-muted-foreground/70">Upcoming</p>
                )
              )}
              {entry.description && (complete || (current && entry.timestamp)) && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/80">
                  {entry.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
