/**
 * Async financial-processing pipeline (the second, independent workflow).
 *
 * Submission (case-service `submitCase`) only ever ENQUEUES a job here in the
 * same transaction that saves the case; it never runs the pipeline. This
 * service owns everything after that:
 *
 *   claim (QUEUED → RUNNING) → Reading → Detecting → Extracting →
 *   Financial Analysis → AI Underwriting → COMPLETED / FAILED
 *
 * The job row (`CaseProcessing`) is the durable, observable, retryable record
 * of that work. A failure never loses the case: the row keeps the reason and
 * the stage that failed, the case is left at PROCESSING_FAILED, and a retry
 * re-runs the SAME uploaded documents — no re-upload required.
 *
 * Execution is driven out-of-band from the request via Next.js `after()` (see
 * the case actions and the poll route). `runCaseProcessing` is idempotent and
 * self-claiming, so a duplicate trigger is a no-op rather than a double run.
 */
import { prisma } from "@/lib/prisma";
import { PROCESSING_STAGES, type ProcessingSnapshot } from "@/lib/processing";
import { recordAudit } from "@/services/audit-service";
import { runDecisionIntelligence } from "@/services/decision/decision-intelligence-service";
import { processCaseDocuments } from "@/services/extraction-service";
import { buildFinancialIntelligence } from "@/services/finance/financial-intelligence-service";

import type { Prisma } from "@/generated/prisma/client";
import type { ProcessingStage } from "@/generated/prisma/enums";

/** A RUNNING job untouched for this long is treated as stalled (crashed mid-run). */
const STALE_RUNNING_MS = 5 * 60 * 1000;

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Enqueues (or re-arms) the processing job for a case. Called INSIDE the
 * submission transaction so the job is committed atomically with the saved
 * case — the case is never left without a job, and no job ever references an
 * uncommitted case.
 */
export function enqueueProcessing(tx: Prisma.TransactionClient, caseId: string) {
  const queued = {
    state: "QUEUED" as const,
    stage: null,
    failedStage: null,
    error: null,
    startedAt: null,
    completedAt: null,
    queuedAt: new Date(),
  };
  return tx.caseProcessing.upsert({
    where: { caseId },
    create: { caseId, ...queued },
    update: queued,
  });
}

/**
 * Runs the pipeline for a case. Self-claiming and idempotent: it only proceeds
 * if it can atomically move the job from QUEUED to RUNNING, so concurrent
 * triggers (submit `after()`, a poll self-heal, a retry) never double-run.
 * Never throws — every failure is captured on the job and the case.
 */
export async function runCaseProcessing(caseId: string): Promise<void> {
  // Atomic claim. Only one caller wins the QUEUED → RUNNING transition.
  const claim = await prisma.caseProcessing.updateMany({
    where: { caseId, state: "QUEUED" },
    data: {
      state: "RUNNING",
      stage: null,
      error: null,
      failedStage: null,
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (claim.count === 0) return; // already running, completed, or no job

  await prisma.underwritingCase.update({
    where: { id: caseId },
    data: { status: "PROCESSING" },
  });

  // Advance the persisted stage monotonically: the extraction pipeline reports
  // Reading/Detecting/Extracting repeatedly across documents, so we never let
  // the dashboard move backwards.
  let stageIndex = -1;
  const advanceTo = async (stage: ProcessingStage) => {
    const next = PROCESSING_STAGES.indexOf(stage);
    if (next <= stageIndex) return;
    stageIndex = next;
    await prisma.caseProcessing.update({ where: { caseId }, data: { stage } });
  };

  try {
    // --- Stages 1–3: read → detect → extract (the IFRS pipeline reports each).
    const pipeline = await processCaseDocuments(caseId, /* system run */ null, advanceTo);
    if (!pipeline.ok) {
      const reason =
        pipeline.failures.map((f) => `${f.fileName}: ${f.message}`).join(" ") ||
        "No usable financial figures could be extracted from the uploaded statements.";
      await failJob(caseId, "EXTRACTING_DATA", reason);
      return;
    }

    // --- Stage 4: financial analysis (deterministic engine, computed on demand).
    await advanceTo("FINANCIAL_ANALYSIS");
    const analysisCase = await prisma.underwritingCase.findUnique({
      where: { id: caseId },
      include: { contractDetails: true, financialStatements: { orderBy: { fiscalYear: "desc" } } },
    });
    const report =
      analysisCase?.contractDetails && analysisCase.financialStatements.length > 0
        ? buildFinancialIntelligence(analysisCase.financialStatements, analysisCase.contractDetails)
        : null;
    if (!report) {
      await failJob(
        caseId,
        "FINANCIAL_ANALYSIS",
        "The financial analysis engine could not produce a result from the extracted figures.",
      );
      return;
    }

    // --- Stage 5: AI underwriting. Pre-generate the memo (system run, no
    // requester) so it is ready and cached when an officer opens the case.
    // BEST-EFFORT by design: the AI assists the bank, it never gates it. The
    // deterministic analysis above already makes the case reviewable, and the
    // officer can (re)generate the memo on demand. A flaky external LLM must
    // not block underwriting or lose the case — a failure here is audited and
    // the case still reaches ANALYSIS_READY.
    await advanceTo("AI_UNDERWRITING");
    const decision = await runDecisionIntelligence(caseId, null);
    if (!decision.ok) {
      await recordAudit({
        action: "case.decision_deferred",
        caseId,
        detail: { stage: "AI_UNDERWRITING", reason: decision.error },
      });
    }

    // --- Success: the case is ready for the officer queue.
    await prisma.$transaction([
      prisma.caseProcessing.update({
        where: { caseId },
        data: { state: "COMPLETED", stage: "AI_UNDERWRITING", completedAt: new Date(), error: null, failedStage: null },
      }),
      prisma.underwritingCase.update({ where: { id: caseId }, data: { status: "ANALYSIS_READY" } }),
    ]);
    await recordAudit({
      action: "case.processing_completed",
      caseId,
      detail: { years: pipeline.years, warnings: pipeline.warnings.length },
    });
  } catch (error) {
    // Any unexpected fault leaves the case saved and the job retryable.
    const stage = stageIndex >= 0 ? PROCESSING_STAGES[stageIndex] : "READING_STATEMENTS";
    console.error(
      "[case-processing]",
      JSON.stringify({
        caseId,
        stage,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }),
    );
    await failJob(
      caseId,
      stage,
      "An unexpected error interrupted processing. You can retry the analysis.",
    );
  }
}

/**
 * Re-arms RUNNING jobs that have gone quiet past the stale window — a runner
 * that was killed mid-flight (e.g. a serverless invocation hit its budget).
 * System-level (no ownership scope): only the scheduled drainer calls it. The
 * stale window MUST exceed the longest realistic run so a genuinely-live runner
 * is never reclaimed out from under itself. Returns how many were re-queued.
 */
export async function reclaimStalledJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const reclaimed = await prisma.caseProcessing.updateMany({
    where: { state: "RUNNING", updatedAt: { lt: cutoff } },
    data: { state: "QUEUED", startedAt: null },
  });
  return reclaimed.count;
}

/**
 * The DURABLE executor of the pipeline. On serverless hosts the request-time
 * `after()` trigger is best-effort — bound to the invocation budget — so a
 * scheduled cron (see /api/cron/process) calls this to (1) reclaim jobs a
 * killed runner left RUNNING and (2) run any QUEUED jobs. Jobs run
 * sequentially to bound peak resource use within the cron's `maxDuration`;
 * `runCaseProcessing` is self-claiming and never throws, so a job another
 * runner already grabbed is simply skipped.
 */
export async function drainProcessingQueue(
  limit = 5,
): Promise<{ reclaimed: number; ran: number }> {
  const reclaimed = await reclaimStalledJobs();
  const queued = await prisma.caseProcessing.findMany({
    where: { state: "QUEUED" },
    orderBy: { queuedAt: "asc" },
    take: limit,
    select: { caseId: true },
  });
  for (const job of queued) {
    await runCaseProcessing(job.caseId);
  }
  return { reclaimed, ran: queued.length };
}

/** Records a terminal failure on both the job and the case (case stays saved). */
async function failJob(caseId: string, stage: ProcessingStage, reason: string): Promise<void> {
  await prisma.$transaction([
    prisma.caseProcessing.update({
      where: { caseId },
      data: { state: "FAILED", failedStage: stage, stage, error: reason, completedAt: new Date() },
    }),
    prisma.underwritingCase.update({ where: { id: caseId }, data: { status: "PROCESSING_FAILED" } }),
  ]);
  await recordAudit({
    action: "case.processing_failed",
    caseId,
    detail: { stage, reason },
  });
}

/**
 * Re-arms a failed (or stalled) job for another run. Ownership-scoped to the
 * case's contractor; the case must be in a failed/processing state. Returns
 * once the job is QUEUED — the caller triggers `runCaseProcessing` via
 * `after()` so the contractor never waits for the pipeline.
 */
export async function retryProcessing(userId: string, caseId: string): Promise<ActionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true },
  });
  const companyId = user?.role === "CONTRACTOR" ? user.companyId : null;
  if (!companyId) return { ok: false, error: "Case not found." };

  const underwritingCase = await prisma.underwritingCase.findFirst({
    where: { id: caseId, companyId },
    include: { processing: true },
  });
  if (!underwritingCase || !underwritingCase.processing) {
    return { ok: false, error: "Case not found." };
  }

  const job = underwritingCase.processing;
  const stale = job.state === "RUNNING" && Date.now() - job.updatedAt.getTime() > STALE_RUNNING_MS;
  if (job.state !== "FAILED" && !stale) {
    return { ok: false, error: "Processing is not in a state that can be retried." };
  }

  await prisma.$transaction([
    prisma.caseProcessing.update({
      where: { caseId },
      data: { state: "QUEUED", stage: null, failedStage: null, error: null, startedAt: null, completedAt: null, queuedAt: new Date() },
    }),
    prisma.underwritingCase.update({ where: { id: caseId }, data: { status: "PROCESSING" } }),
  ]);
  await recordAudit({ action: "case.processing_retried", actorId: userId, caseId });
  return { ok: true };
}

/**
 * Serializable snapshot of a case's job for the poll endpoint and the initial
 * server render. `stalled` flags a RUNNING job that has gone quiet (a crash),
 * so the dashboard can offer a retry instead of spinning forever.
 */
export function toProcessingSnapshot(job: {
  state: ProcessingSnapshot["state"];
  stage: ProcessingSnapshot["stage"];
  failedStage: ProcessingSnapshot["failedStage"];
  attempts: number;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}): ProcessingSnapshot & { stalled: boolean } {
  return {
    state: job.state,
    stage: job.stage,
    failedStage: job.failedStage,
    attempts: job.attempts,
    error: job.error,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
    stalled: job.state === "RUNNING" && Date.now() - job.updatedAt.getTime() > STALE_RUNNING_MS,
  };
}

/** Ownership-scoped read of a case's processing snapshot (null = not yours / none). */
export async function getProcessingForOwner(
  userId: string,
  caseId: string,
): Promise<(ProcessingSnapshot & { stalled: boolean }) | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true },
  });
  const companyId = user?.role === "CONTRACTOR" ? user.companyId : null;
  if (!companyId) return null;

  const job = await prisma.caseProcessing.findFirst({
    where: { caseId, case: { companyId } },
  });
  return job ? toProcessingSnapshot(job) : null;
}
