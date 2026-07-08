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
  FINANCIAL_ANALYSIS: "Financial Analysis",
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
 * Serializable snapshot of a case's processing job. Flattened (Dates → ISO)
 * so it crosses the server→client boundary and the poll endpoint verbatim.
 */
export interface ProcessingSnapshot {
  state: ProcessingState;
  stage: ProcessingStage | null;
  failedStage: ProcessingStage | null;
  attempts: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

/** True while the job still needs watching (poller keeps polling). */
export function isProcessingActive(state: ProcessingState): boolean {
  return state === "QUEUED" || state === "RUNNING";
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
      ? "Queued"
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
