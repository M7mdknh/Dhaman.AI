"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";

import {
  saveMemoRevisionAction,
  submitToRiskOfficerAction,
} from "@/app/(app)/review/actions";
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
    const result = await submitToRiskOfficerAction(caseId);
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
          onChange={(e) => setSummary(e.target.value)}
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
            disabled={pending || !summary.trim()}
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
              {reference} — your current wording is saved as a new revision and the package
              moves to the Risk Officer&apos;s queue. The final decision rests with the Risk
              Officer.
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
