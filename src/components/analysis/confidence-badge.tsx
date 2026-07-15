import { CheckCircle2, ShieldAlert, ShieldQuestion } from "lucide-react";

import { BADGE_TONE } from "@/lib/finance/display";
import { cn } from "@/lib/utils";

import type { ConfidenceLevel, ConfidenceMeta } from "@/lib/finance/confidence";

const CONFIDENCE_ICON: Record<ConfidenceLevel, typeof CheckCircle2> = {
  HIGH: CheckCircle2,
  MEDIUM: ShieldQuestion,
  LOW: ShieldAlert,
};

/**
 * How far this assessment can be trusted, stated next to the verdict it
 * qualifies. A Risk Officer should never have to wonder whether the numbers
 * beside it are complete — so this is never hidden, not even at High.
 */
export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: ConfidenceMeta;
  className?: string;
}) {
  const Icon = CONFIDENCE_ICON[confidence.level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        BADGE_TONE[confidence.tone],
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {confidence.label}
    </span>
  );
}
