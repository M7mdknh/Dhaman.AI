/**
 * Officer review workflow (Sprint 5): start review, record decisions,
 * resume after requested information. Transition legality lives in
 * `lib/review.ts` (pure, unit-tested); this service enforces it against
 * the database, keeps decisions as append-only data, and audits everything.
 *
 * The officer is the ONLY decision maker — nothing here reads or acts on
 * the AI recommendation; it is linked (`decisionIntelligenceId`) purely so
 * the record shows what the officer had in front of them.
 */
import { prisma } from "@/lib/prisma";
import { canDecide, canResumeReview, canStartReview, decisionTargetStatus } from "@/lib/review";
import { recordAudit } from "@/services/audit-service";
import { getOfficerUser } from "@/services/officer-case-service";

import type { CaseStatus, OfficerDecisionType } from "@/generated/prisma/enums";

type ActionResult = { ok: true } | { ok: false; error: string };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "a draft",
  SUBMITTED: "awaiting processing",
  PROCESSING: "still being processed",
  PROCESSING_FAILED: "blocked by a processing failure",
  PARSING: "still parsing",
  ANALYSIS_READY: "ready for review",
  RM_REVIEWED: "ready for review",
  UNDER_REVIEW: "under review",
  INFO_REQUESTED: "awaiting requested information",
  APPROVED: "already decided",
  DECLINED: "already decided",
  ISSUED: "already issued",
};

/**
 * Explicit start — viewing a case never changes its state. The first
 * officer to start the review is recorded as the assigned officer.
 */
export async function startReview(officerUserId: string, caseId: string): Promise<ActionResult> {
  const officer = await getOfficerUser(officerUserId);
  if (!officer) return { ok: false, error: "Only bank staff can review cases." };

  const underwritingCase = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: { status: true, reference: true, assignedOfficerId: true },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };
  if (!canStartReview(underwritingCase.status)) {
    return {
      ok: false,
      error: `This case is ${STATUS_LABEL[underwritingCase.status] ?? "not reviewable"} — review cannot start.`,
    };
  }

  // Conditional write is the race guard: the status read above can go stale
  // between here and now (a concurrent start or decision). Only transition a
  // case STILL in a startable status — count === 0 means it moved under us.
  const moved = await prisma.underwritingCase.updateMany({
    where: { id: caseId, status: { in: ["ANALYSIS_READY", "RM_REVIEWED"] } },
    data: {
      status: "UNDER_REVIEW",
      reviewStartedAt: new Date(),
      assignedOfficerId: underwritingCase.assignedOfficerId ?? officerUserId,
    },
  });
  if (moved.count === 0) {
    return {
      ok: false,
      error: "This case's status changed before the review could start. Refresh and try again.",
    };
  }
  await recordAudit({
    action: "officer.review_started",
    actorId: officerUserId,
    caseId,
    detail: { reference: underwritingCase.reference },
  });
  return { ok: true };
}

/** INFO_REQUESTED → UNDER_REVIEW once the requested information arrived. */
export async function resumeReview(officerUserId: string, caseId: string): Promise<ActionResult> {
  const officer = await getOfficerUser(officerUserId);
  if (!officer) return { ok: false, error: "Only bank staff can review cases." };

  const underwritingCase = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: { status: true, reference: true },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };
  if (!canResumeReview(underwritingCase.status)) {
    return { ok: false, error: "Only cases awaiting requested information can be resumed." };
  }

  // Conditional write (race guard): only resume a case STILL awaiting info.
  const moved = await prisma.underwritingCase.updateMany({
    where: { id: caseId, status: "INFO_REQUESTED" },
    data: { status: "UNDER_REVIEW" },
  });
  if (moved.count === 0) {
    return {
      ok: false,
      error: "This case's status changed before it could be resumed. Refresh and try again.",
    };
  }
  await recordAudit({
    action: "officer.review_resumed",
    actorId: officerUserId,
    caseId,
    detail: { reference: underwritingCase.reference },
  });
  return { ok: true };
}

/**
 * Records an officer decision (append-only) and moves the case. Reason is
 * mandatory for every decision; conditions are mandatory for
 * APPROVE_WITH_CONDITIONS. The decision row links the memo the officer saw.
 */
export async function recordDecision(
  officerUserId: string,
  caseId: string,
  input: { decision: OfficerDecisionType; reason: string; conditions?: string },
): Promise<ActionResult> {
  const officer = await getOfficerUser(officerUserId);
  if (!officer) return { ok: false, error: "Only bank staff can decide cases." };

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required for every decision." };
  const conditions = input.conditions?.trim() || null;
  if (input.decision === "APPROVE_WITH_CONDITIONS" && !conditions) {
    return { ok: false, error: "Conditions are required when approving with conditions." };
  }

  const underwritingCase = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      reference: true,
      assignedOfficerId: true,
      decisionIntelligence: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };
  if (!canDecide(underwritingCase.status, input.decision)) {
    return {
      ok: false,
      error: `This case is ${STATUS_LABEL[underwritingCase.status] ?? "not decidable"} — start the review first.`,
    };
  }

  const targetStatus = decisionTargetStatus(input.decision);
  const isTerminal = targetStatus !== "INFO_REQUESTED";
  // The statuses this decision may legally move FROM — mirrors canDecide, and
  // used below as the race guard so a stale read cannot double-record.
  const allowedSources: CaseStatus[] =
    input.decision === "REQUEST_INFO" ? ["UNDER_REVIEW"] : ["UNDER_REVIEW", "INFO_REQUESTED"];

  // Move the case FIRST, conditionally: the update only fires while the case
  // is still in a decidable status. count === 0 means another actor already
  // decided it between the read above and now — abort so we never write a
  // second decision (or a second status flip) for the same review.
  const committed = await prisma.$transaction(async (tx) => {
    const moved = await tx.underwritingCase.updateMany({
      where: { id: caseId, status: { in: allowedSources } },
      data: {
        status: targetStatus,
        decidedAt: isTerminal ? new Date() : null,
        assignedOfficerId: underwritingCase.assignedOfficerId ?? officerUserId,
      },
    });
    if (moved.count === 0) return false;
    await tx.officerDecision.create({
      data: {
        caseId,
        officerId: officerUserId,
        decision: input.decision,
        reason,
        conditions: input.decision === "APPROVE_WITH_CONDITIONS" ? conditions : null,
        decisionIntelligenceId: underwritingCase.decisionIntelligence[0]?.id ?? null,
      },
    });
    return true;
  });
  if (!committed) {
    return {
      ok: false,
      error: "This case's status changed before the decision was recorded. Refresh and try again.",
    };
  }

  await recordAudit({
    action: "officer.decided",
    actorId: officerUserId,
    caseId,
    detail: {
      reference: underwritingCase.reference,
      decision: input.decision,
      targetStatus,
      memoId: underwritingCase.decisionIntelligence[0]?.id ?? null,
    },
  });
  return { ok: true };
}
