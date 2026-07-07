import { AlertTriangle, CheckCircle2, Search, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { RecommendationType } from "@/generated/prisma/client";

const META: Record<
  RecommendationType,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  APPROVE: {
    label: "Approve",
    icon: CheckCircle2,
    className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  },
  APPROVE_WITH_CONDITIONS: {
    label: "Approve with Conditions",
    icon: AlertTriangle,
    className: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  },
  MANUAL_REVIEW: {
    label: "Manual Review",
    icon: Search,
    className: "border-border bg-muted text-foreground",
  },
  REJECT: {
    label: "Reject",
    icon: XCircle,
    className: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
  },
};

export function recommendationLabel(recommendation: RecommendationType): string {
  return META[recommendation].label;
}

/** Bank-policy recommendation (derived from the risk band — never by the AI). */
export function RecommendationBadge({
  recommendation,
  className,
}: {
  recommendation: RecommendationType;
  className?: string;
}) {
  const meta = META[recommendation];
  return (
    <Badge variant="outline" className={cn("gap-1", meta.className, className)}>
      <meta.icon className="size-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}
