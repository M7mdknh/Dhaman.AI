import { Badge } from "@/components/ui/badge";
import { CASE_STATUS_LABELS } from "@/lib/case-constants";
import { cn } from "@/lib/utils";

import type { CaseStatus } from "@/generated/prisma/enums";

/**
 * Status chip tones, grouped by workflow phase so color carries meaning:
 * neutral = not yet with the bank, blue = machine work in flight,
 * indigo/violet = awaiting bank staff, amber = review in progress,
 * emerald = positive outcome, red = needs attention / negative outcome.
 * Soft tinted fill + matching dot — readable in both themes.
 */
const TONE_CLASSES: Record<CaseStatus, { chip: string; dot: string }> = {
  DRAFT: {
    chip: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  SUBMITTED: {
    chip: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  PROCESSING: {
    chip: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    dot: "bg-sky-500 animate-pulse",
  },
  PARSING: {
    chip: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    dot: "bg-sky-500 animate-pulse",
  },
  PROCESSING_FAILED: {
    chip: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    dot: "bg-red-500",
  },
  ANALYSIS_READY: {
    chip: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  RM_REVIEWED: {
    chip: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  UNDER_REVIEW: {
    chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  INFO_REQUESTED: {
    chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  APPROVED: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  ISSUED: {
    chip: "border-emerald-300 bg-emerald-100/70 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-600",
  },
  DECLINED: {
    chip: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    dot: "bg-red-500",
  },
};

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  const tone = TONE_CLASSES[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", tone.chip, className)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {CASE_STATUS_LABELS[status]}
    </Badge>
  );
}
