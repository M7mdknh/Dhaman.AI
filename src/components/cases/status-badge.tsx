import { Badge } from "@/components/ui/badge";
import { CASE_STATUS_LABELS } from "@/lib/case-constants";
import { cn } from "@/lib/utils";

import type { CaseStatus } from "@/generated/prisma/enums";

/** Status dot color per lifecycle stage (badge itself stays neutral). */
const DOT_CLASSES: Record<CaseStatus, string> = {
  DRAFT: "bg-muted-foreground/60",
  SUBMITTED: "bg-blue-500",
  PROCESSING: "bg-blue-500",
  PROCESSING_FAILED: "bg-red-500",
  PARSING: "bg-blue-500",
  ANALYSIS_READY: "bg-indigo-500",
  UNDER_REVIEW: "bg-amber-500",
  INFO_REQUESTED: "bg-amber-500",
  APPROVED: "bg-emerald-500",
  ISSUED: "bg-emerald-600",
  DECLINED: "bg-red-500",
};

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", className)}>
      <span className={cn("size-1.5 rounded-full", DOT_CLASSES[status])} aria-hidden />
      {CASE_STATUS_LABELS[status]}
    </Badge>
  );
}
