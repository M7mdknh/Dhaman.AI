"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";

import {
  saveMemoRevisionAction,
  submitToRiskOfficerAction,
} from "@/app/(app)/review/actions";
import { DECISION_OPTIONS, type DecisionValue } from "@/components/review/decision-options";
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

/**
 * The Relationship Manager's working surface: refine the AI-drafted
 * executive summary, add relationship context, and route the package to the
 * Risk Officer. Every save is a new memo revision — version-tracked, never
 * overwriting the AI original.
 */
export function RmReviewForm({
  caseId,
  reference,
  defaultSummary,
  defaultContext,
  canSubmit,
}: {
  caseId: string;
  reference: string;
  /** Starting point: the latest revision, falling back to the AI draft. */
  defaultSummary: string;
  defaultContext: string;
  /** True only while the case still awaits routing (ANALYSIS_READY). */
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(defaultSummary);
  const [context, setContext] = useState(defaultContext);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  // The suggested decision — a recommendation for the Risk Officer, never
  // binding. Required before routing: the officer should never receive a
  // package with no starting point.
  const [decision, setDecision] = useState<DecisionValue | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionConditions, setDecisionConditions] = useState("");
  const needsConditions = decision === "APPROVE_WITH_CONDITIONS";
  const decisionReady =
    decision !== null &&
    decisionReason.trim().length > 0 &&
    (!needsConditions || decisionConditions.trim().length > 0);

  // The AI draft is generated lazily: opening this desk starts it, and it
  // lands seconds later via a background refresh that re-renders the server
  // component with a new `defaultSummary`. Client state survives that
  // re-render, so without this the draft would never reach the textarea and
  // the RM would stare at an empty box until they hit reload. Adopt a
  // late-arriving draft ONLY while the RM has not written anything —
  // their words always win.
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current && defaultSummary && !summary) setSummary(defaultSummary);
  }, [defaultSummary, summary]);

  async function handleSave() {
    setPending(true);
    const result = await saveMemoRevisionAction(caseId, {
      summary,
      relationshipContext: context || undefined,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Memo revision saved");
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  async function handleSubmit() {
    if (!decision) return;
    setPending(true);
    // Route with the latest wording: persist any unsaved refinement first so
    // the officer never reads a stale version of what the RM meant to send.
    if (summary.trim() && (summary !== defaultSummary || context !== defaultContext)) {
      const saved = await saveMemoRevisionAction(caseId, {
        summary,
        relationshipContext: context || undefined,
      });
      if (!saved.ok) {
        setPending(false);
        setConfirming(false);
        if (saved.error) toast.error(saved.error);
        return;
      }
    }
    const result = await submitToRiskOfficerAction(caseId, {
      decision,
      reason: decisionReason,
      conditions: needsConditions ? decisionConditions : undefined,
    });
    setPending(false);
    setConfirming(false);
    if (result.ok) {
      toast.success(`${reference} routed to the Risk Officer`);
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="rm-summary">
          Executive Summary <span className="text-red-600">*</span>
        </Label>
        <Textarea
          id="rm-summary"
          value={summary}
          onChange={(e) => {
            dirty.current = true;
            setSummary(e.target.value);
          }}
          rows={6}
          maxLength={4000}
          placeholder="The AI-drafted summary appears here once generated — refine it, or write your own."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rm-context">Relationship Context</Label>
        <Textarea
          id="rm-context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Optional — client history, payment behavior, pipeline, anything the statements cannot show."
        />
      </div>

      {canSubmit && (
        <div className="space-y-4 border-t border-border pt-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested Decision
            </legend>
            <p className="text-[11px] text-muted-foreground">
              A recommendation for the Risk Officer — never binding. The Officer reviews it
              alongside the case and makes the final call.
            </p>
            {DECISION_OPTIONS.map((option) => (
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
                  name="rm-suggested-decision"
                  value={option.value}
                  checked={decision === option.value}
                  onChange={() => setDecision(option.value)}
                  className="sr-only"
                />
                <option.icon className={cn("mt-0.5 size-4 shrink-0", option.iconClass)} aria-hidden />
                <span>
                  <span className="block text-[13px] font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="rm-decision-reason">
              Reasoning <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="rm-decision-reason"
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="Why you're recommending this outcome (shown to the Risk Officer)."
            />
          </div>

          {needsConditions && (
            <div className="space-y-1.5">
              <Label htmlFor="rm-decision-conditions">
                Conditions <span className="text-red-600">*</span>
              </Label>
              <Textarea
                id="rm-decision-conditions"
                value={decisionConditions}
                onChange={(e) => setDecisionConditions(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Explicit conditions the suggested approval is subject to."
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full"
          disabled={pending || !summary.trim()}
          onClick={handleSave}
        >
          <Save className="size-4" aria-hidden />
          Save Revision
        </Button>
        {canSubmit && (
          <Button
            className="w-full"
            disabled={pending || !summary.trim() || !decisionReady}
            onClick={() => setConfirming(true)}
          >
            <Send className="size-4" aria-hidden />
            Submit to Risk Officer
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit to Risk Officer?</DialogTitle>
            <DialogDescription>
              {reference} — your current wording is saved as a new revision, your suggested
              decision is recorded, and the package moves to the Risk Officer&apos;s queue. The
              final decision rests with the Risk Officer.
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
            <Button onClick={handleSubmit} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Submit to Risk Officer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
