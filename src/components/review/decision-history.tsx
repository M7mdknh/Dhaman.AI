import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { OfficerDecisionType } from "@/generated/prisma/enums";
import type { LucideIcon } from "lucide-react";

export interface DecisionView {
  id: string;
  decision: OfficerDecisionType;
  reason: string;
  conditions: string | null;
  officer: string;
  createdAt: string; // ISO
}

const META: Record<OfficerDecisionType, { label: string; icon: LucideIcon; className: string }> = {
  APPROVE: { label: "Approved", icon: CheckCircle2, className: "text-emerald-600" },
  APPROVE_WITH_CONDITIONS: {
    label: "Approved with Conditions",
    icon: AlertTriangle,
    className: "text-amber-600",
  },
  REJECT: { label: "Rejected", icon: XCircle, className: "text-red-600" },
  REQUEST_INFO: {
    label: "Information Requested",
    icon: HelpCircle,
    className: "text-sky-600",
  },
};

export function officerDecisionLabel(decision: OfficerDecisionType): string {
  return META[decision].label;
}

/** Append-only decision record: who, when, what, why. */
export function DecisionHistory({ decisions }: { decisions: DecisionView[] }) {
  if (decisions.length === 0) return null;
  return (
    <ol className="space-y-3">
      {decisions.map((entry) => {
        const meta = META[entry.decision];
        return (
          <li key={entry.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <meta.icon className={cn("size-4 shrink-0", meta.className)} aria-hidden />
              <span className="text-[13px] font-semibold text-foreground">{meta.label}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
              {entry.reason}
            </p>
            {entry.conditions && (
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Conditions: </span>
                {entry.conditions}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {entry.officer} · {formatDateTime(entry.createdAt)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
