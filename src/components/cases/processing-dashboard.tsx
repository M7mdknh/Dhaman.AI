"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  MinusCircle,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { retryProcessingAction } from "@/app/(app)/cases/actions";
import { UnderwritingHeadlineCard } from "@/components/cases/underwriting-headline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildProcessingSteps,
  deriveDocumentViews,
  deriveProgress,
  deriveStageTimings,
  isProcessingActive,
  type DocumentSnapshot,
  type DocumentViewModel,
  type ProcessingSnapshot,
  type ProcessingStep,
  type StageTiming,
} from "@/lib/processing";
import { contractorNotice } from "@/lib/finance/confidence";
import { cn } from "@/lib/utils";

import type { UnderwritingHeadline } from "@/lib/finance/headline";

/** The poll payload: job snapshot + per-document lifecycles + Stage-1 headline. */
type Snapshot = ProcessingSnapshot & {
  stalled: boolean;
  headline?: UnderwritingHeadline | null;
  documents?: DocumentSnapshot[];
};

/**
 * Poll cadence. Fast while Stage 1 is still running (we want the headline to
 * appear the instant it is ready), relaxed once results are on screen and only
 * the background AI memo remains.
 */
const POLL_FAST_MS = 900;
const POLL_SLOW_MS = 2000;

/** The case-level steps that remain case-wide (documents cover the rest). */
const CASE_STEP_KEYS = new Set(["FINANCIAL_ANALYSIS", "AI_UNDERWRITING", "completed"]);

/** "0.8s" under 10s, "12s" after — matches how people read short durations. */
function formatDuration(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s <= 1 ? "a moment" : `~${s}s`;
}

function StateIcon({ state }: { state: DocumentViewModel["state"] | ProcessingStep["state"] }) {
  switch (state) {
    case "complete":
      return <Check className="size-4 text-emerald-600" aria-hidden />;
    case "running":
    case "active":
      return <Loader2 className="size-4 animate-spin text-blue-600" aria-hidden />;
    case "failed":
      return <X className="size-4 text-red-600" aria-hidden />;
    case "skipped":
      return <MinusCircle className="size-4 text-muted-foreground/60" aria-hidden />;
    default:
      return <span className="size-2 rounded-full bg-muted-foreground/30" aria-hidden />;
  }
}

/**
 * One document's independent lifecycle row (GitHub-Actions-job style): live
 * stage, progress, elapsed/remaining, retry on failure, and an expandable
 * per-stage timing breakdown ("View details").
 */
function DocumentRow({
  doc,
  onRetry,
  retrying,
}: {
  doc: DocumentViewModel;
  onRetry: () => void;
  retrying: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expandable = doc.timings.length > 0;

  const rightMeta =
    doc.state === "running" ? (
      <span className="shrink-0 text-xs tabular-nums text-blue-600">
        {formatDuration(doc.elapsedMs ?? 0)}
        {doc.estRemainingMs !== null && (
          <span className="text-muted-foreground"> · {formatRemaining(doc.estRemainingMs)} left</span>
        )}
      </span>
    ) : doc.state === "complete" && doc.elapsedMs !== null ? (
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatDuration(doc.elapsedMs)}
      </span>
    ) : doc.state === "failed" && doc.elapsedMs !== null ? (
      <span className="shrink-0 text-xs tabular-nums text-red-600">
        {formatDuration(doc.elapsedMs)}
      </span>
    ) : null;

  return (
    <li className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-3 p-3 text-left",
          expandable && "cursor-pointer",
        )}
        aria-expanded={open}
      >
        <span className="mt-0.5 flex size-5 items-center justify-center" aria-hidden>
          <StateIcon state={doc.state} />
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              <FileText className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
              <span className="truncate text-sm font-medium text-foreground">{doc.fileName}</span>
              {doc.fiscalYear !== null && (
                <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  FY {doc.fiscalYear}
                </span>
              )}
            </span>
            {rightMeta}
          </span>
          <span
            className={cn(
              "block text-xs",
              doc.state === "failed" ? "font-medium text-red-600" : "text-muted-foreground",
            )}
          >
            {doc.statusLabel}
            {doc.note && doc.state === "running" && ` — ${doc.note}`}
          </span>
          {doc.state === "running" && (
            <span className="block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-blue-600 transition-all duration-700"
                style={{ width: `${Math.max(4, doc.progressPct)}%` }}
              />
            </span>
          )}
        </span>
        {expandable && (
          <span className="mt-0.5 text-muted-foreground" aria-hidden>
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </span>
        )}
      </button>

      {open && expandable && (
        <ol className="animate-in fade-in-0 slide-in-from-top-1 space-y-1.5 border-t px-3 py-2.5 pl-11 duration-200">
          {doc.timings.map((t) => (
            <li key={t.stage} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span className={t.running ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {t.label}
                </span>
                {t.note && <span className="text-muted-foreground"> — {t.note}</span>}
              </span>
              <span className={cn("shrink-0 tabular-nums", t.running ? "text-blue-600" : "text-muted-foreground")}>
                {t.running ? `Running… ${formatDuration(t.durationMs)}` : formatDuration(t.durationMs)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {doc.state === "failed" && (
        <div className="space-y-2 border-t px-3 py-2.5 pl-11">
          {doc.error && <p className="text-xs text-red-600">{doc.error}</p>}
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RotateCw className="size-3.5" aria-hidden />
            )}
            Retry this document
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Only this document is reprocessed — completed statements are never redone.
          </p>
        </div>
      )}
    </li>
  );
}

function StepRow({ step, timing }: { step: ProcessingStep; timing?: StageTiming }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-5 items-center justify-center" aria-hidden>
        <StateIcon state={step.state} />
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

/**
 * Live processing dashboard. Every uploaded statement renders its OWN
 * lifecycle row (queue position → live stages → terminal state) that updates
 * independently; the case-level steps below cover the shared stages
 * (Financial Intelligence, the background AI memo). The underwriting headline
 * appears the moment the FIRST statement completes — the user always sees
 * progress happening.
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
  // Seeded from the server-rendered snapshot, never from a fresh Date.now()
  // here: this initializer runs once during SSR and again during client
  // hydration, and two independent Date.now() calls never agree, which
  // desyncs any still-running stage's elapsed time and fails hydration. The
  // ticking effect below corrects to real wall time within a second of mount.
  const [now, setNow] = useState(() => new Date(initial.updatedAt).getTime());
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

  // A 1s ticker keeps elapsed timers moving smoothly between polls. Corrects
  // the server-seeded `now` to real wall time immediately on mount, then
  // every second after.
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

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
        // Failed documents go back to the queue; completed ones stay done.
        documents: prev.documents?.map((d) =>
          d.status === "FAILED" ? { ...d, status: "QUEUED", events: [], error: null } : d,
        ),
      }));
      toast.success("Resuming analysis");
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  const documents = deriveDocumentViews(snapshot.documents ?? [], snapshot.state, now);
  const documentsDone = documents.filter((d) => d.state === "complete" || d.state === "skipped").length;
  const failedDocs = documents.filter((d) => d.state === "failed");
  const caseSteps = buildProcessingSteps(snapshot).filter((s) => CASE_STEP_KEYS.has(s.key));
  // Live per-stage durations from the run's event log, ticking with `now`.
  const timings = deriveStageTimings(snapshot, now);
  const failed = snapshot.state === "FAILED";
  // Job finished, but a document could not be read: the assessment stands on
  // the statements that WERE verified (partial) — say so, offer the retry.
  const partial = snapshot.state === "COMPLETED" && failedDocs.length > 0;
  const showRetry = failed || snapshot.stalled;
  // The figures parsed but could not be trusted. `snapshot.error` is the
  // validator's reason — precise balance-sheet arithmetic written for a Risk
  // Officer. The applicant is not being audited by this screen: they get the
  // document-focused notice instead, and never a suggestion that their
  // company's finances are the problem.
  const validationFailed = failed && snapshot.failedStage === "FINANCIAL_ANALYSIS";
  const notice = contractorNotice();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {failed ? (
            "We couldn't finish your underwriting package"
          ) : partial ? (
            `Underwriting assessment ready — ${failedDocs.length === 1 ? "one statement" : `${failedDocs.length} statements`} could not be read`
          ) : (
            <>
              <Sparkles className="size-4 text-blue-600" aria-hidden />
              Preparing your underwriting package
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline first: the moment the first statement lands, the verdict is here. */}
        {headline && (
          <div className="rise-in space-y-2">
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
                {snapshot.state === "QUEUED" && "…"}
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

        {/* Each statement's independent lifecycle. */}
        {documents.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Financial Statements
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {documentsDone} of {documents.length} processed
              </span>
            </div>
            <ul className="space-y-2">
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.documentId}
                  doc={doc}
                  onRetry={handleRetry}
                  retrying={retrying}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Case-wide stages that run across all statements. */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Underwriting Analysis
          </h3>
          <ol className="space-y-2.5">
            {caseSteps.map((step) => (
              <StepRow key={step.key} step={step} timing={timings[step.key as keyof typeof timings]} />
            ))}
          </ol>
        </div>

        {partial && (
          <Alert>
            <AlertTriangle className="size-4 text-amber-600" aria-hidden />
            <AlertTitle>This assessment uses the statements we could verify</AlertTitle>
            <AlertDescription>
              The analysis above is based on {documentsDone} of {documents.length} uploaded
              statements. Retry the unread document below to include it — verified statements
              are never reprocessed.
            </AlertDescription>
          </Alert>
        )}

        {showRetry && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>
              {validationFailed
                ? notice.title
                : failed
                  ? "Processing didn't finish"
                  : "This is taking longer than expected"}
            </AlertTitle>
            <AlertDescription>
              {validationFailed
                ? notice.body
                : `${
                    failed
                      ? (snapshot.error ?? "An error interrupted processing.")
                      : "We'll keep trying, or you can resume now."
                  } Your case, documents, and completed steps are saved — resuming never repeats finished work and never re-uploads anything.`}
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
