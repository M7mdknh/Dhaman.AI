import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { CasePriority } from "@/lib/review";

const META: Record<CasePriority, { label: string; className: string }> = {
  HIGH: { label: "High", className: "border-red-200 bg-red-50 text-red-700" },
  NORMAL: { label: "Normal", className: "border-amber-200 bg-amber-50 text-amber-700" },
  LOW: { label: "Low", className: "border-border bg-muted text-muted-foreground" },
};

/** Deterministic queue priority (risk band + exposure — see lib/review.ts). */
export function PriorityBadge({ priority }: { priority: CasePriority }) {
  const meta = META[priority];
  return (
    <Badge variant="outline" className={cn("font-medium", meta.className)}>
      {meta.label}
    </Badge>
  );
}
