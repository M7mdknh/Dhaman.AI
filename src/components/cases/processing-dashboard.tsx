"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RotateCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { retryProcessingAction } from "@/app/(app)/cases/actions";
import { UnderwritingHeadlineCard } from "@/components/cases/underwriting-headline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildProcessingSteps,
  deriveProgress,
  deriveStageTimings,
  isProcessingActive,
  type ProcessingSnapshot,
  type ProcessingStep,
  type StageTiming,
} from "@/lib/processing";
import { cn } from "@/lib/utils";

import type { UnderwritingHeadline } from "@/lib/finance/headline";

/** The poll payload: the job snapshot + Stage-1 headline once it exists. */
type Snapshot = ProcessingSnapshot & { stalled: boolean; headline?: UnderwritingHeadline | null };

/**
 * Poll cadence. Fast while Stage 1 is still running (we want the headline to
 * appear the instant it is ready), relaxed once results are on screen and only
 * the background AI memo remains.
 */
const POLL_FAST_MS = 900;
const POLL_SLOW_MS = 2000;

/** "0.8s" under 10s, "12s" after — matches how people read short durations. */
function formatDuration(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

function StepRow({ step, timing }: { step: ProcessingStep; timing?: StageTiming }) {
  const icon =
    step.state === "complete" ? (
      <Check className="size-4 text-emerald-600" aria-hidden />
    ) : step.state === "active" ? (
      <Loader2 className="size-4 animate-spin text-blue-600" aria-hidden />
    ) : step.state === "failed" ? (
      <X className="size-4 text-red-600" aria-hidden />
    ) : (
      <span className="size-2 rounded-full bg-muted-foreground/30" aria-hidden />
    );

  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-5 items-center justify-center" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm",
            step.state === "complete" && "text-foreground",
            step.state === "active" && "font-medium text-foreground",
            step.state === "failed" && "font-medium text-red-600",
            step.state === "pending" && "text-muted-foreground",
          )}
        >
          {step.label}
        </span>
        {step.state === "active" && timing?.note && (
          <span className="block text-xs text-muted-foreground">{timing.note}</span>
        )}
      </span>
      {timing && (step.state === "complete" || step.state === "active") && (
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums",
            step.state === "active" ? "text-blue-600" : "text-muted-foreground",
          )}
        >
          {step.state === "active"
            ? `Running… ${formatDuration(timing.durationMs)}`
            : formatDuration(timing.durationMs)}
        </span>
      )}
    </li>
  );
}

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s <= 1 ? "a moment" : `~${s}s`;
}

/**
 * Live "Preparing your underwriting package" dashboard. Two-stage: the moment
 * Stage 1 completes it renders the deterministic underwriting headline (the
 * user feels done), while Stage 2 (the AI memo) keeps running in the background.
 * Refreshes to the full analysis on completion; offers a Retry on failure.
 */
export function ProcessingDashboard({
  caseId,
  initial,
}: {
  caseId: string;
  initial: Snapshot;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [retrying, setRetrying] = useState(false);
  const completedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/processing`, { cache: "no-store" });
      if (!res.ok) return;
      const data: Snapshot = await res.json();
      setSnapshot(data);
      if (data.state === "COMPLETED" && !completedRef.current) {
        completedRef.current = true;
        toast.success("Underwriting package ready");
        router.refresh();
      }
    } catch {
      // Transient network hiccup — the next tick retries.
    }
  }, [caseId, router]);

  const live = isProcessingActive(snapshot.state) && !snapshot.stalled;
  const progress = deriveProgress(snapshot);
  const headline = snapshot.headline ?? null;
  // Speed up polling until the headline is on screen, then relax.
  const pollMs = headline ? POLL_SLOW_MS : POLL_FAST_MS;

  useEffect(() => {
    if (!live) return;
    void fetchStatus();
    const id = setInterval(fetchStatus, pollMs);
    return () => clearInterval(id);
  }, [live, pollMs, fetchStatus]);

  async function handleRetry() {
    setRetrying(true);
    const result = await retryProcessingAction(caseId);
    setRetrying(false);
    if (result.ok) {
      completedRef.current = false;
      setSnapshot((prev) => ({
        ...prev,
        state: "QUEUED",
        stage: null,
        failedStage: null,
        error: null,
        stageEvents: [],
        stalled: false,
      }));
      toast.success("Resuming analysis");
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  const steps = buildProcessingSteps(snapshot);
  // Live per-stage durations from the run's event log. Recomputed on every
  // render; the poll ticks every 1–2s, which keeps the active timer moving.
  const timings = deriveStageTimings(snapshot);
  const failed = snapshot.state === "FAILED";
  const showRetry = failed || snapshot.stalled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {failed ? (
            "We couldn't finish your underwriting package"
          ) : (
            <>
              <Sparkles className="size-4 text-blue-600" aria-hidden />
              Preparing your underwriting package
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline first: as soon as Stage 1 completes, the verdict is here. */}
        {headline && (
          <div className="space-y-2">
            <UnderwritingHeadlineCard headline={headline} />
            {!failed && snapshot.state !== "COMPLETED" && (
              <p className="text-xs text-muted-foreground">
                Your core underwriting assessment is ready. We are finalising the deep analysis and
                AI memo in the background — you can leave this page.
              </p>
            )}
          </div>
        )}

        {/* Progress: overall %, current step, estimated remaining time. */}
        {!failed && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {snapshot.state === "COMPLETED"
                  ? "Complete"
                  : (progress.currentStepLabel ?? "Preparing")}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {progress.overallPct}%
                {snapshot.state !== "COMPLETED" && ` · ${formatRemaining(progress.estRemainingMs)} left`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress.overallPct}%` }}
              />
            </div>
          </div>
        )}

        {!headline && !failed && (
          <p className="text-sm text-muted-foreground">
            Your case has been submitted and saved. We are analysing the uploaded financial
            statements — this runs in the background, so you can safely leave this page.
          </p>
        )}

        <ol className="space-y-2.5">
          {steps.map((step) => (
            <StepRow
              key={step.key}
              step={step}
              timing={timings[step.key as keyof typeof timings]}
            />
          ))}
        </ol>

        {showRetry && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>{failed ? "Processing didn't finish" : "This is taking longer than expected"}</AlertTitle>
            <AlertDescription>
              {failed
                ? (snapshot.error ?? "An error interrupted processing.")
                : "We'll keep trying, or you can resume now."}{" "}
              Your case, documents, and completed steps are saved — resuming never repeats
              finished work and never re-uploads anything.
            </AlertDescription>
          </Alert>
        )}

        {showRetry && (
          <div className="flex items-center gap-3">
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="size-4" aria-hidden />
              )}
              Resume Processing
            </Button>
            {snapshot.attempts > 1 && (
              <span className="text-xs text-muted-foreground">Attempt {snapshot.attempts}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
