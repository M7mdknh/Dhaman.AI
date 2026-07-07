"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { decideAction } from "@/app/(app)/review/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

type DecisionValue = "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "REQUEST_INFO";

const OPTIONS: {
  value: DecisionValue;
  label: string;
  hint: string;
  icon: LucideIcon;
  iconClass: string;
}[] = [
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

/**
 * The officer decision form. Reason is mandatory for every decision;
 * conditions are mandatory for a conditional approval; every submission
 * passes through an explicit confirmation dialog.
 */
export function DecisionForm({
  caseId,
  reference,
  allowRequestInfo = true,
}: {
  caseId: string;
  reference: string;
  /** False while already awaiting information — asking twice is not a decision. */
  allowRequestInfo?: boolean;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<DecisionValue | null>(null);
  const [reason, setReason] = useState("");
  const [conditions, setConditions] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const options = allowRequestInfo ? OPTIONS : OPTIONS.filter((o) => o.value !== "REQUEST_INFO");
  const selected = OPTIONS.find((o) => o.value === decision) ?? null;
  const needsConditions = decision === "APPROVE_WITH_CONDITIONS";
  const ready =
    decision !== null && reason.trim().length > 0 && (!needsConditions || conditions.trim());

  async function handleConfirm() {
    if (!decision) return;
    setPending(true);
    const result = await decideAction(caseId, {
      decision,
      reason,
      conditions: needsConditions ? conditions : undefined,
    });
    setPending(false);
    setConfirming(false);
    if (result.ok) {
      toast.success(`Decision recorded for ${reference}`);
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Decision
        </legend>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
              decision === option.value
                ? "border-ring bg-accent"
                : "border-border hover:bg-accent/50",
            )}
          >
            <input
              type="radio"
              name="officer-decision"
              value={option.value}
              checked={decision === option.value}
              onChange={() => setDecision(option.value)}
              className="sr-only"
            />
            <option.icon className={cn("mt-0.5 size-4 shrink-0", option.iconClass)} aria-hidden />
            <span>
              <span className="block text-[13px] font-medium text-foreground">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="decision-reason">
          Reason <span className="text-red-600">*</span>
        </Label>
        <Textarea
          id="decision-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Internal reasoning for this decision (mandatory, recorded with the decision)."
        />
      </div>

      {needsConditions && (
        <div className="space-y-1.5">
          <Label htmlFor="decision-conditions">
            Conditions <span className="text-red-600">*</span>
          </Label>
          <Textarea
            id="decision-conditions"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Explicit conditions the approval is subject to."
          />
        </div>
      )}

      <Button className="w-full" disabled={!ready} onClick={() => setConfirming(true)}>
        Record Decision
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm decision</DialogTitle>
            <DialogDescription>
              {reference} — record “{selected?.label}”? The decision is stored with your name,
              a timestamp, and your reasoning, and is written to the audit trail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={pending}>
                  Cancel
                </Button>
              }
            />
            <Button onClick={handleConfirm} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Confirm — {selected?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
