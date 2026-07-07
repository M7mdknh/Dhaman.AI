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
 * The blocking pipeline stages, in execution order. Processing COMPLETES at
 * FINANCIAL_ANALYSIS: the deterministic Financial Intelligence Engine is
 * sufficient to make a case reviewable, so the contractor never waits on the
 * LLM. The AI underwriting memo is generated lazily instead (when a Risk
 * Officer opens the case, or on explicit request) and is therefore NOT a
 * processing stage — see docs/ASYNC_PROCESSING.md. `AI_UNDERWRITING` remains a
 * valid enum value (kept for STAGE_LABELS and historical job rows) but is no
 * longer part of the gating sequence.
 */
export const PROCESSING_STAGES: ProcessingStage[] = [
  "READING_STATEMENTS",
  "DETECTING_STATEMENTS",
  "EXTRACTING_DATA",
  "FINANCIAL_ANALYSIS",
];

export const STAGE_LABELS: Record<ProcessingStage, string> = {
  READING_STATEMENTS: "Reading Financial Statements",
  DETECTING_STATEMENTS: "Detecting Financial Statements",
  EXTRACTING_DATA: "Extracting Financial Data",
  FINANCIAL_ANALYSIS: "Financial Analysis",
  AI_UNDERWRITING: "AI Underwriting",
};

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
