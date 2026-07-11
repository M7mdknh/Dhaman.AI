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
import { env } from "@/lib/env";
import { deriveHeadline, type UnderwritingHeadline } from "@/lib/finance/headline";
import { formatPerfReport, formatStageTargets, StageTimer, STAGE } from "@/lib/ifrs/perf";
import { prisma } from "@/lib/prisma";
import { PROCESSING_STAGES, type ProcessingSnapshot, type StageEvent } from "@/lib/processing";
import { recordAudit } from "@/services/audit-service";
import { runDecisionIntelligence } from "@/services/decision/decision-intelligence-service";
import { processCaseDocuments } from "@/services/extraction-service";
import { buildFinancialIntelligence } from "@/services/finance/financial-intelligence-service";

import type { Prisma } from "@/generated/prisma/client";
import type { ProcessingStage } from "@/generated/prisma/enums";

/**
 * A RUNNING job untouched for this long is treated as stalled (crashed
 * mid-run). A LIVE run can never look stalled: it heartbeats the job row
 * every HEARTBEAT_MS even while deep inside a long extraction, so quiet
 * really does mean dead — and the poll can safely auto-resume it.
 */
const STALE_RUNNING_MS = 90 * 1000;
const HEARTBEAT_MS = 15 * 1000;

/** Auto-resume (poll-triggered) stops after this many attempts; the manual
 * Retry button keeps working — a human can always insist. */
const MAX_AUTO_ATTEMPTS = 5;

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
    stageEvents: [] as Prisma.InputJsonValue,
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
      stageEvents: [],
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (claim.count === 0) return; // already running, completed, or no job

  // Heartbeat: bump the job row while the run is alive so a long stage (vision
  // on a scanned report, the OCR fallback) never reads as a stall. Scoped to
  // state=RUNNING so it can never resurrect a job another actor re-queued.
  const heartbeat = setInterval(() => {
    void prisma.caseProcessing
      .updateMany({ where: { caseId, state: "RUNNING" }, data: { state: "RUNNING" } })
      .catch(() => {});
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  // Kick off the two writes/reads that DON'T depend on extraction so they run
  // CONCURRENTLY with the ~1s document pipeline instead of adding ~350ms of
  // serial remote round-trips ahead of it:
  //   • flip the case to PROCESSING (observational; drives the case list)
  //   • fetch the contract (needed by the engine, not by extraction)
  // Both are awaited later, by which point they have long since resolved.
  const statusPromise = prisma.underwritingCase
    .update({ where: { id: caseId }, data: { status: "PROCESSING" } })
    .then(() => {}, () => {});
  const contractPromise = prisma.contractDetails.findUnique({ where: { caseId } });

  // Non-critical writes moved off the Stage-1 critical path, settled before the
  // job is marked COMPLETED (so nothing is lost) but never gating readiness.
  const deferred: Promise<unknown>[] = [];

  // Advance the persisted stage monotonically: the extraction pipeline reports
  // Reading/Detecting/Extracting repeatedly across documents, so we never let
  // the dashboard move backwards. Each advance appends a timestamped event to
  // the run's execution log (`stageEvents`) — the dashboard derives live
  // per-stage durations from it. The write is FIRE-AND-FORGET: stage progress
  // is observational (it drives the live dashboard), not correctness, so a
  // progress round-trip must never sit on the ≤3s Stage-1 critical path. The
  // dashboard poll simply reads whatever stage has committed.
  let stageIndex = -1;
  const stageEvents: StageEvent[] = [];
  const advanceTo = async (stage: ProcessingStage, note?: string) => {
    const next = PROCESSING_STAGES.indexOf(stage);
    if (next <= stageIndex) {
      // Same stage, richer context (e.g. "AI vision reading scanned pages"):
      // annotate the existing event so the dashboard can explain the wait.
      if (note && next === stageIndex && stageEvents.length > 0) {
        stageEvents[stageEvents.length - 1].note = note;
        void prisma.caseProcessing
          .update({
            where: { caseId },
            data: { stageEvents: stageEvents as unknown as Prisma.InputJsonValue },
          })
          .catch(() => {});
      }
      return;
    }
    stageIndex = next;
    stageEvents.push({ stage, startedAt: new Date().toISOString(), ...(note ? { note } : {}) });
    void prisma.caseProcessing
      .update({
        where: { caseId },
        data: { stage, stageEvents: stageEvents as unknown as Prisma.InputJsonValue },
      })
      .catch(() => {});
  };

  // End-to-end timer for the whole-case performance report (every stage:
  // duration, share, recommendation). Extraction reports its own sub-stages;
  // we fold them in and add financial analysis + AI underwriting.
  const timer = new StageTimer();

  const mode = env.UNDERWRITING_MODE;
  try {
    // --- Stages 1–3: read → detect → extract (the IFRS pipeline reports each).
    // Its non-critical writes come back in `pipeline.deferred` — settled later.
    const pipeline = await processCaseDocuments(caseId, /* system run */ null, advanceTo, mode);
    timer.absorb(pipeline.perf);
    deferred.push(...pipeline.deferred);
    if (!pipeline.ok) {
      await statusPromise; // ensure PROCESSING landed before PROCESSING_FAILED
      const reason =
        pipeline.failures.map((f) => `${f.fileName}: ${f.message}`).join(" ") ||
        "No usable financial figures could be extracted from the uploaded statements.";
      await failJob(caseId, "EXTRACTING_DATA", reason);
      return;
    }

    // ---- STAGE 1 (Fast Financial Intelligence): the deterministic engine.
    // Runs on the statements the pipeline just returned (no re-read) and the
    // contract fetched CONCURRENTLY above — the engine itself is ~1ms, so this
    // stage adds no round-trip to the critical path.
    await advanceTo("FINANCIAL_ANALYSIS");
    const report = await timer.time(STAGE.FINANCIAL_ANALYSIS, async () => {
      const contract = await contractPromise;
      return contract && pipeline.statements.length > 0
        ? buildFinancialIntelligence(pipeline.statements, contract)
        : null;
    });
    if (!report) {
      await statusPromise;
      await failJob(
        caseId,
        "FINANCIAL_ANALYSIS",
        "The financial analysis engine could not produce a result from the extracted figures.",
      );
      return;
    }

    // STAGE 1 COMPLETE — the case is REVIEWABLE NOW and the underwriting headline
    // (capacity, rating, health, risk, recommendation) is available. Flip the
    // case to ANALYSIS_READY immediately so the dashboard shows results while the
    // job keeps RUNNING for Stage 2. This is the "feels done in <3s" moment.
    const stage1Ms = timer.report().wallMs;
    await statusPromise; // PROCESSING must be committed before ANALYSIS_READY
    await prisma.underwritingCase.update({
      where: { id: caseId },
      data: { status: "ANALYSIS_READY" },
    });
    await advanceTo("AI_UNDERWRITING");
    deferred.push(
      recordAudit({
        action: "case.analysis_ready",
        caseId,
        detail: { mode, stage1Ms, years: pipeline.years, band: report.risk.band },
      }),
    );

    // ---- STAGE 2 (Deep Financial Intelligence): the AI underwriting memo.
    // EXPRESS mode generates it LAZILY (on first officer open — the review page
    // triggers it) so it never touches the contractor's path. COMPREHENSIVE
    // generates it eagerly here, in the background. Either way it is best-effort
    // and never un-readies the case.
    let memoGenerated = false;
    if (mode === "comprehensive") {
      // RESUME GUARD: a memo that already exists (an earlier run got this far,
      // or an officer generated one) is never regenerated — a succeeded AI
      // request is never repeated. runDecisionIntelligence additionally caches
      // by input hash, so even a forced re-entry cannot double-call the model.
      const existingMemo = await prisma.decisionIntelligence.findFirst({
        where: { caseId },
        select: { id: true },
      });
      const decision = existingMemo
        ? { ok: true as const }
        : await timer.time(STAGE.AI_UNDERWRITING, () => runDecisionIntelligence(caseId, null));
      memoGenerated = decision.ok;
      if (!decision.ok) {
        deferred.push(
          recordAudit({
            action: "case.decision_deferred",
            caseId,
            detail: { stage: "AI_UNDERWRITING", reason: decision.error },
          }),
        );
      }
    }

    // ---- Settle the deferred (off-critical-path) writes before closing the job
    // so extraction rows, document status, and audits are durable when COMPLETED.
    await Promise.allSettled(deferred);

    // ---- Whole pipeline done.
    await prisma.caseProcessing.update({
      where: { caseId },
      data: { state: "COMPLETED", stage: "AI_UNDERWRITING", completedAt: new Date(), error: null, failedStage: null },
    });

    const perf = timer.report();
    console.log("[case-processing]", formatPerfReport(perf, `case ${caseId} (${mode})`));
    console.log("[case-processing]", formatStageTargets(stage1Ms, perf.wallMs));
    await recordAudit({
      action: "case.processing_completed",
      caseId,
      detail: {
        mode,
        years: pipeline.years,
        warnings: pipeline.warnings.length,
        stage1Ms,
        totalMs: perf.wallMs,
        memoGenerated,
        memoDeferred: mode === "express",
      },
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
  } finally {
    clearInterval(heartbeat);
  }
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

  await requeueJob(caseId);
  await recordAudit({ action: "case.processing_retried", actorId: userId, caseId });
  return { ok: true };
}

/** Re-arms a job to QUEUED for another (resuming) run. Completed work is
 * never redone: extraction results are checkpointed per document, so the next
 * run reuses them and continues from the first unfinished stage. */
async function requeueJob(caseId: string): Promise<void> {
  await prisma.$transaction([
    prisma.caseProcessing.update({
      where: { caseId },
      data: {
        state: "QUEUED",
        stage: null,
        failedStage: null,
        error: null,
        stageEvents: [],
        startedAt: null,
        completedAt: null,
        queuedAt: new Date(),
      },
    }),
    prisma.underwritingCase.update({ where: { id: caseId }, data: { status: "PROCESSING" } }),
  ]);
}

/**
 * Self-healing for a DEAD run (poll-triggered): a RUNNING job whose heartbeat
 * has gone quiet past the stall threshold is re-queued so the next
 * `runCaseProcessing` resumes it — no human intervention, no lost case.
 * Attempt-capped so a genuinely broken document cannot loop forever; the
 * manual Retry button has no cap. Returns true when a resume was armed.
 */
export async function resumeStalledProcessing(caseId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  // Atomic: only one poller wins the RUNNING→QUEUED flip for a stale job.
  const requeued = await prisma.caseProcessing.updateMany({
    where: {
      caseId,
      state: "RUNNING",
      updatedAt: { lt: cutoff },
      attempts: { lt: MAX_AUTO_ATTEMPTS },
    },
    data: {
      state: "QUEUED",
      stage: null,
      failedStage: null,
      error: null,
      stageEvents: [],
      startedAt: null,
      completedAt: null,
      queuedAt: new Date(),
    },
  });
  if (requeued.count === 0) return false;
  await recordAudit({
    action: "case.processing_auto_resumed",
    caseId,
    detail: { reason: "stalled run heartbeat went quiet" },
  });
  return true;
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
  stageEvents?: unknown;
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
    stageEvents: Array.isArray(job.stageEvents) ? (job.stageEvents as StageEvent[]) : [],
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

/** The poll payload: the job snapshot plus the Stage-1 underwriting headline
 * (present the instant deterministic analysis exists — before the AI memo). */
export interface ProcessingView {
  snapshot: ProcessingSnapshot & { stalled: boolean };
  headline: UnderwritingHeadline | null;
}

/**
 * Ownership-scoped poll read. Returns the job snapshot AND — as soon as the
 * deterministic statements exist (Stage 1 done) — the underwriting headline, so
 * the dashboard can show results the moment Stage 1 completes without a full
 * page reload.
 */
export async function getProcessingViewForOwner(
  userId: string,
  caseId: string,
): Promise<ProcessingView | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true },
  });
  const companyId = user?.role === "CONTRACTOR" ? user.companyId : null;
  if (!companyId) return null;

  const underwritingCase = await prisma.underwritingCase.findFirst({
    where: { id: caseId, companyId },
    include: {
      processing: true,
      contractDetails: true,
      financialStatements: { orderBy: { fiscalYear: "desc" } },
    },
  });
  if (!underwritingCase?.processing) return null;

  const report = buildFinancialIntelligence(
    underwritingCase.financialStatements,
    underwritingCase.contractDetails,
  );
  return {
    snapshot: toProcessingSnapshot(underwritingCase.processing),
    headline: report ? deriveHeadline(report) : null,
  };
}
