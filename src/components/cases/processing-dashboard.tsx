"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";

import { retryProcessingAction } from "@/app/(app)/cases/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildProcessingSteps,
  isProcessingActive,
  type ProcessingSnapshot,
  type ProcessingStep,
} from "@/lib/processing";
import { cn } from "@/lib/utils";

type Snapshot = ProcessingSnapshot & { stalled: boolean };

/** Poll cadence while the pipeline is live. Cheap read; light on the DB. */
const POLL_MS = 2500;

function StepRow({ step }: { step: ProcessingStep }) {
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
    <li className="flex items-center gap-3">
      <span className="flex size-5 items-center justify-center" aria-hidden>
        {icon}
      </span>
      <span
        className={cn(
          "text-sm",
          step.state === "complete" && "text-foreground",
          step.state === "active" && "font-medium text-foreground",
          step.state === "failed" && "font-medium text-red-600",
          step.state === "pending" && "text-muted-foreground",
        )}
      >
        {step.label}
      </span>
    </li>
  );
}

/**
 * Live processing dashboard shown on the case page while the async pipeline
 * runs. Polls the processing endpoint, renders the ordered stage checklist,
 * refreshes the page to reveal the analysis on success, and offers a Retry
 * (no re-upload) on failure.
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
  // Guards the one-time refresh when the pipeline completes.
  const completedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/processing`, { cache: "no-store" });
      if (!res.ok) return;
      const data: Snapshot = await res.json();
      setSnapshot(data);
      if (data.state === "COMPLETED" && !completedRef.current) {
        completedRef.current = true;
        toast.success("Financial processing complete");
        router.refresh();
      }
    } catch {
      // Transient network hiccup — the next tick retries.
    }
  }, [caseId, router]);

  const live = isProcessingActive(snapshot.state) && !snapshot.stalled;

  useEffect(() => {
    if (!live) return;
    // Poll immediately (catch fast transitions), then on an interval.
    void fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [live, fetchStatus]);

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
        stalled: false,
      }));
      toast.success("Retrying analysis");
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  const steps = buildProcessingSteps(snapshot);
  const failed = snapshot.state === "FAILED";
  const stalled = snapshot.stalled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {failed ? "Processing Failed" : stalled ? "Processing Stalled" : "Processing Financial Statements"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!failed && !stalled && (
          <p className="text-sm text-muted-foreground">
            Your case has been submitted and saved. We are analysing the uploaded financial
            statements — this runs in the background, so you can safely leave this page.
          </p>
        )}

        <ol className="space-y-2.5">
          {steps.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </ol>

        {(failed || stalled) && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>{failed ? "We couldn't finish processing" : "Processing looks stuck"}</AlertTitle>
            <AlertDescription>
              {failed
                ? (snapshot.error ??
                  "An error interrupted processing.")
                : "This case has been processing longer than expected. You can retry the analysis."}
              {" "}
              Your case and its documents are saved — retry without re-uploading anything.
            </AlertDescription>
          </Alert>
        )}

        {(failed || stalled) && (
          <div className="flex items-center gap-3">
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="size-4" aria-hidden />
              )}
              Retry Analysis
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
