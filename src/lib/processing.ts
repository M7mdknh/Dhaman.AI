/**
 * Pure processing-pipeline rules (no I/O). The single source of truth for the
 * ordered stages of the async financial-processing pipeline and for deriving
 * the live "processing dashboard" the contractor watches on the case page.
 *
 * Kept framework-free and Prisma-free so it is safe to import from client
 * components and to unit-test exhaustively.
 */
import type { ProcessingStage, ProcessingState } from "@/generated/prisma/enums";

/**
 * The pipeline runs in TWO stages (see docs/ASYNC_PROCESSING.md):
 *
 *  - STAGE 1 — Fast Financial Intelligence (target ≤3s): read → detect →
 *    extract → deterministic financial analysis. The case flips to
 *    ANALYSIS_READY here and the underwriting HEADLINE is shown — the user
 *    already feels the analysis is complete.
 *  - STAGE 2 — Deep Financial Intelligence (background, target: whole pipeline
 *    ≤10s): the AI underwriting memo. It never gates readiness; the dashboard
 *    keeps updating while it runs.
 */
export const STAGE1_STAGES: ProcessingStage[] = [
  "READING_STATEMENTS",
  "DETECTING_STATEMENTS",
  "EXTRACTING_DATA",
  "FINANCIAL_ANALYSIS",
];
export const STAGE2_STAGES: ProcessingStage[] = ["AI_UNDERWRITING"];

/** All stages, in execution order. */
export const PROCESSING_STAGES: ProcessingStage[] = [...STAGE1_STAGES, ...STAGE2_STAGES];

/** The last Stage-1 stage — its completion means the headline is ready. */
export const STAGE1_LAST: ProcessingStage = "FINANCIAL_ANALYSIS";

export const STAGE_LABELS: Record<ProcessingStage, string> = {
  READING_STATEMENTS: "Reading Financial Statements",
  DETECTING_STATEMENTS: "Detecting Financial Statements",
  EXTRACTING_DATA: "Extracting Financial Data",
  FINANCIAL_ANALYSIS: "Financial Intelligence",
  AI_UNDERWRITING: "AI Underwriting Memo",
};

/**
 * Nominal per-stage durations (ms) used ONLY to render a smooth progress bar
 * and a rough "estimated remaining" — not a promise. Stage 2 (the LLM) is by
 * far the longest, which is exactly why it runs after the user already has
 * results.
 */
const STAGE_WEIGHTS: Record<ProcessingStage, number> = {
  READING_STATEMENTS: 600,
  DETECTING_STATEMENTS: 300,
  EXTRACTING_DATA: 900,
  FINANCIAL_ANALYSIS: 500,
  AI_UNDERWRITING: 6500,
};
const TOTAL_WEIGHT = PROCESSING_STAGES.reduce((sum, s) => sum + STAGE_WEIGHTS[s], 0);

/** Visual state of a single row in the processing dashboard. */
export type StepState = "complete" | "active" | "pending" | "failed";

export interface ProcessingStep {
  key: string;
  label: string;
  state: StepState;
}

/**
 * One live execution event: stage X began at T (optionally with a human note,
 * e.g. "Reading scanned pages with AI vision"). A stage's duration is derived:
 * it ends when the next stage begins, or when the run completes/fails.
 */
export interface StageEvent {
  stage: ProcessingStage;
  startedAt: string; // ISO
  note?: string;
}

/**
 * Serializable snapshot of a case's processing job. Flattened (Dates → ISO)
 * so it crosses the server→client boundary and the poll endpoint verbatim.
 */
export interface ProcessingSnapshot {
  state: ProcessingState;
  stage: ProcessingStage | null;
  failedStage: ProcessingStage | null;
  attempts: number;
  error: string | null;
  /** Live per-stage execution log of the current run (may be empty). */
  stageEvents: StageEvent[];
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

/** Timing readout for one dashboard step, derived from the event log. */
export interface StageTiming {
  /** Milliseconds the stage ran (still counting while active). */
  durationMs: number;
  /** True while this is the currently-executing stage. */
  running: boolean;
  note?: string;
}

/**
 * Derives per-stage durations from the event log (pure — safe on the client).
 * A stage ends when the next event begins; the last event ends at
 * `completedAt` (finished runs) or `now` (still running).
 */
export function deriveStageTimings(
  job: ProcessingSnapshot,
  now: number = Date.now(),
): Partial<Record<ProcessingStage, StageTiming>> {
  const timings: Partial<Record<ProcessingStage, StageTiming>> = {};
  const events = job.stageEvents;
  const terminal = job.completedAt ? new Date(job.completedAt).getTime() : null;

  events.forEach((event, i) => {
    const start = new Date(event.startedAt).getTime();
    const next = events[i + 1] ? new Date(events[i + 1].startedAt).getTime() : null;
    const running = next === null && terminal === null && job.state === "RUNNING";
    const end = next ?? terminal ?? now;
    timings[event.stage] = {
      durationMs: Math.max(0, end - start),
      running,
      note: event.note,
    };
  });
  return timings;
}

/** True while the job still needs watching (poller keeps polling). */
export function isProcessingActive(state: ProcessingState): boolean {
  return state === "QUEUED" || state === "RUNNING";
}

// ---------------------------------------------------------------------------
// Per-document lifecycle (each uploaded statement progresses independently).
// ---------------------------------------------------------------------------

/** The stages ONE document moves through inside the extraction pipeline. */
export type DocumentStage =
  | "PREPARING"
  | "READING_STATEMENTS"
  | "DETECTING_STATEMENTS"
  | "EXTRACTING_DATA";

export const DOCUMENT_STAGES: DocumentStage[] = [
  "PREPARING",
  "READING_STATEMENTS",
  "DETECTING_STATEMENTS",
  "EXTRACTING_DATA",
];

export const DOCUMENT_STAGE_LABELS: Record<DocumentStage, string> = {
  PREPARING: "Preparing",
  READING_STATEMENTS: "Reading Financial Statements",
  DETECTING_STATEMENTS: "Detecting Financial Statements",
  EXTRACTING_DATA: "Extracting Financial Data",
};

/** Event stages include the terminal markers so total elapsed time is exact. */
export type DocumentEventStage = DocumentStage | "COMPLETED" | "FAILED";

/** One live event in a document's own execution log. */
export interface DocumentEvent {
  stage: DocumentEventStage;
  startedAt: string; // ISO
  note?: string;
}

export type DocumentRunStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

/** Serializable per-document snapshot carried by the poll payload. */
export interface DocumentSnapshot {
  documentId: string;
  fileName: string;
  fiscalYear: number | null;
  status: DocumentRunStatus;
  /** This document's own event log (may be empty for legacy runs). */
  events: DocumentEvent[];
  /** Human-readable failure reason when status is FAILED. */
  error: string | null;
}

/** Nominal per-stage durations (ms) for ONE document — progress/ETA only. */
const DOC_STAGE_WEIGHTS: Record<DocumentStage, number> = {
  PREPARING: 400,
  READING_STATEMENTS: 700,
  DETECTING_STATEMENTS: 1400, // AI vision on scanned pages dominates here
  EXTRACTING_DATA: 700,
};
const DOC_TOTAL_WEIGHT = DOCUMENT_STAGES.reduce((sum, s) => sum + DOC_STAGE_WEIGHTS[s], 0);

/** Documents extracted concurrently by the pipeline (mirrors the server). */
const DOC_CONCURRENCY = 3;
/** Nominal delay before a QUEUED job's run claims and starts (the poll/`after()` trigger). */
const JOB_START_MS = 1_500;

export type DocumentRowState = "queued" | "running" | "complete" | "failed" | "skipped";

/** Timing readout for one stage of one document, derived from its event log. */
export interface DocumentStageTiming {
  stage: DocumentStage;
  label: string;
  durationMs: number;
  running: boolean;
  note?: string;
}

/** Everything a dashboard row needs to render one document's live lifecycle. */
export interface DocumentViewModel {
  documentId: string;
  fileName: string;
  fiscalYear: number | null;
  state: DocumentRowState;
  /** Current stage / terminal summary — never a bare "Queued". */
  statusLabel: string;
  /** Extra context for a long wait (e.g. "Reading scanned pages with AI vision"). */
  note: string | null;
  progressPct: number;
  /** Wall time since this document started (live while running). */
  elapsedMs: number | null;
  /** Rough nominal remaining time while running. */
  estRemainingMs: number | null;
  /** 1-based position among documents that have not started yet. */
  queuePosition: number | null;
  /** Rough nominal wait until this document starts. */
  estStartMs: number | null;
  /** Per-stage breakdown for the expandable details view. */
  timings: DocumentStageTiming[];
  error: string | null;
}

/** Derives the per-stage breakdown of one document from its event log. */
function deriveDocTimings(events: DocumentEvent[], now: number): DocumentStageTiming[] {
  const active = events.filter((e) => e.stage !== "COMPLETED" && e.stage !== "FAILED");
  const terminal = events.find((e) => e.stage === "COMPLETED" || e.stage === "FAILED");
  const terminalAt = terminal ? new Date(terminal.startedAt).getTime() : null;

  return active.map((event, i) => {
    const start = new Date(event.startedAt).getTime();
    const next = active[i + 1] ? new Date(active[i + 1].startedAt).getTime() : null;
    const end = next ?? terminalAt ?? now;
    return {
      stage: event.stage as DocumentStage,
      label: DOCUMENT_STAGE_LABELS[event.stage as DocumentStage] ?? event.stage,
      durationMs: Math.max(0, end - start),
      running: next === null && terminalAt === null,
      note: event.note,
    };
  });
}

/**
 * Derives the live view models for ALL of a case's documents (pure — safe on
 * the client; call with a ticking `now` for live timers). Queue positions and
 * start estimates come from list order: documents that have not emitted any
 * event yet are waiting, and up to DOC_CONCURRENCY of them run at once.
 */
export function deriveDocumentViews(
  documents: DocumentSnapshot[],
  jobState: ProcessingState,
  now: number = Date.now(),
): DocumentViewModel[] {
  let waiting = 0;

  return documents.map((doc) => {
    const timings = deriveDocTimings(doc.events, now);
    const startedAt = doc.events.length > 0 ? new Date(doc.events[0].startedAt).getTime() : null;
    const terminal = doc.events.find((e) => e.stage === "COMPLETED" || e.stage === "FAILED");
    const terminalAt = terminal ? new Date(terminal.startedAt).getTime() : null;
    const elapsedMs =
      startedAt !== null ? Math.max(0, (terminalAt ?? now) - startedAt) : null;

    if (doc.status === "SKIPPED") {
      return view(doc, {
        state: "skipped",
        statusLabel: "Not needed — Express underwriting uses your latest audited statement",
        progressPct: 100,
        timings,
        elapsedMs: null,
      });
    }
    if (doc.status === "COMPLETED") {
      return view(doc, {
        state: "complete",
        statusLabel: "Completed",
        progressPct: 100,
        timings,
        elapsedMs,
      });
    }
    if (doc.status === "FAILED") {
      const lastStage = timings[timings.length - 1];
      return view(doc, {
        state: "failed",
        statusLabel: lastStage ? `Failed at ${lastStage.label}` : "Failed",
        progressPct: docProgressPct(timings, false),
        timings,
        elapsedMs,
        error: doc.error,
      });
    }

    const running = doc.status === "PROCESSING" && jobState === "RUNNING" && timings.length > 0;
    if (running) {
      const current = timings[timings.length - 1];
      const donePct = docProgressPct(timings, true);
      return view(doc, {
        state: "running",
        statusLabel: current.label,
        note: current.note ?? null,
        progressPct: donePct,
        timings,
        elapsedMs,
        estRemainingMs: Math.max(500, Math.round(DOC_TOTAL_WEIGHT * (1 - donePct / 100))),
      });
    }

    // Not started yet (job queued, or job running with more docs than slots).
    waiting += 1;
    const batchesAhead = Math.floor((waiting - 1) / DOC_CONCURRENCY);
    const estStartMs =
      (jobState === "QUEUED" ? JOB_START_MS : 0) + batchesAhead * DOC_TOTAL_WEIGHT;
    return view(doc, {
      state: "queued",
      statusLabel: `Queued — position ${waiting}, starting in ~${Math.max(1, Math.round(estStartMs / 1000))}s`,
      progressPct: 0,
      timings,
      elapsedMs: null,
      queuePosition: waiting,
      estStartMs,
    });
  });
}

/** Weight-based completion of one document; the active stage is half-credited. */
function docProgressPct(timings: DocumentStageTiming[], hasActive: boolean): number {
  let done = 0;
  timings.forEach((t, i) => {
    const isLast = i === timings.length - 1;
    const weight = DOC_STAGE_WEIGHTS[t.stage] ?? 0;
    done += hasActive && isLast ? weight / 2 : weight;
  });
  return Math.min(100, Math.round((done / DOC_TOTAL_WEIGHT) * 100));
}

function view(
  doc: DocumentSnapshot,
  fields: Partial<DocumentViewModel> & Pick<DocumentViewModel, "state" | "statusLabel" | "progressPct" | "timings">,
): DocumentViewModel {
  return {
    documentId: doc.documentId,
    fileName: doc.fileName,
    fiscalYear: doc.fiscalYear,
    note: null,
    elapsedMs: null,
    estRemainingMs: null,
    queuePosition: null,
    estStartMs: null,
    error: null,
    ...fields,
  };
}

/** Live progress readout for the "Preparing your underwriting package" UI. */
export interface ProcessingProgress {
  /** Overall completion, 0-100. */
  overallPct: number;
  /** Nominal remaining time (ms) — a smooth estimate, not a guarantee. */
  estRemainingMs: number;
  currentStepLabel: string | null;
  completedStepLabels: string[];
  /** Stage 1 finished → the deterministic headline is available. */
  stage1Complete: boolean;
}

/**
 * Derives the progress bar / ETA from a job snapshot (pure — safe on the
 * client). The active stage counts as half-done so the bar always advances.
 */
export function deriveProgress(job: ProcessingSnapshot): ProcessingProgress {
  const isDone = job.state === "COMPLETED";
  const stageIndex = job.stage ? PROCESSING_STAGES.indexOf(job.stage) : -1;

  let doneWeight = 0;
  const completedStepLabels: string[] = [];
  PROCESSING_STAGES.forEach((stage, i) => {
    const before = stageIndex >= 0 && i < stageIndex;
    if (isDone || before) {
      doneWeight += STAGE_WEIGHTS[stage];
      completedStepLabels.push(STAGE_LABELS[stage]);
    } else if (i === stageIndex && job.state === "RUNNING") {
      doneWeight += STAGE_WEIGHTS[stage] / 2; // active stage is half-credited
    }
  });

  const overallPct = isDone ? 100 : Math.round((doneWeight / TOTAL_WEIGHT) * 100);
  const currentStepLabel = isDone
    ? null
    : job.state === "QUEUED"
      ? "Starting analysis"
      : stageIndex >= 0
        ? STAGE_LABELS[PROCESSING_STAGES[stageIndex]]
        : STAGE_LABELS[PROCESSING_STAGES[0]];

  const stage1Complete =
    isDone || (stageIndex >= 0 && stageIndex > PROCESSING_STAGES.indexOf(STAGE1_LAST));

  return {
    overallPct,
    estRemainingMs: isDone ? 0 : Math.max(0, Math.round(TOTAL_WEIGHT - doneWeight)),
    currentStepLabel,
    completedStepLabels,
    stage1Complete,
  };
}

/**
 * Builds the ordered dashboard steps from a job snapshot. The two framing
 * steps ("Case Submitted", "Documents Uploaded") are always complete once a
 * job exists — the case and its documents were persisted synchronously at
 * submission. The pipeline stages resolve against the job's state/stage, and a
 * trailing "Completed" caps the list.
 */
export function buildProcessingSteps(job: ProcessingSnapshot): ProcessingStep[] {
  const stageIndex = job.stage ? PROCESSING_STAGES.indexOf(job.stage) : -1;
  const failedIndex = job.failedStage ? PROCESSING_STAGES.indexOf(job.failedStage) : -1;
  const isFailed = job.state === "FAILED";
  const isDone = job.state === "COMPLETED";

  const stageState = (i: number): StepState => {
    if (isDone) return "complete";
    if (isFailed) {
      // The stage that died is failed; everything before it ran; after is moot.
      if (failedIndex >= 0) {
        if (i < failedIndex) return "complete";
        if (i === failedIndex) return "failed";
        return "pending";
      }
      return i === 0 ? "failed" : "pending";
    }
    // QUEUED or RUNNING: stages before the current one are done, the current
    // one is active, later ones are pending. Nothing is active while QUEUED.
    if (job.state === "QUEUED") return "pending";
    if (stageIndex < 0) return "pending";
    if (i < stageIndex) return "complete";
    if (i === stageIndex) return "active";
    return "pending";
  };

  const steps: ProcessingStep[] = [
    { key: "submitted", label: "Case Submitted", state: "complete" },
    { key: "uploaded", label: "Documents Uploaded", state: "complete" },
    ...PROCESSING_STAGES.map((stage, i) => ({
      key: stage,
      label: STAGE_LABELS[stage],
      state: stageState(i),
    })),
    {
      key: "completed",
      label: "Completed",
      state: isDone ? ("complete" as StepState) : ("pending" as StepState),
    },
  ];

  return steps;
}
