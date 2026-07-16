import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";

import type { LucideIcon } from "lucide-react";

export type DecisionValue = "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "REQUEST_INFO";

export interface DecisionOption {
  value: DecisionValue;
  label: string;
  hint: string;
  icon: LucideIcon;
  iconClass: string;
}

/** Shared vocabulary for both the officer's decision and the RM's suggested
 * decision — same OfficerDecisionType, same labels, so the officer reads the
 * RM's suggestion in exactly the terms they will use to decide themselves. */
export const DECISION_OPTIONS: DecisionOption[] = [
  {
    value: "APPROVE",
    label: "Approve",
    hint: "Clear the case for a Letter of Guarantee.",
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
  },
  {
    value: "APPROVE_WITH_CONDITIONS",
    label: "Approve with Conditions",
    hint: "Approve subject to explicit conditions.",
    icon: AlertTriangle,
    iconClass: "text-amber-600",
  },
  {
    value: "REJECT",
    label: "Reject",
    hint: "Decline the guarantee request.",
    icon: XCircle,
    iconClass: "text-red-600",
  },
  {
    value: "REQUEST_INFO",
    label: "Request More Information",
    hint: "Pause the review; the message is shown to the applicant.",
    icon: HelpCircle,
    iconClass: "text-sky-600",
  },
];

export function decisionOptionLabel(value: DecisionValue): string {
  return DECISION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
