/**
 * Relationship Manager workflow (framework step 8): the RM reviews the
 * AI-drafted memo, refines it with relationship insight (version-tracked,
 * append-only — the AI original is never mutated), and routes the package
 * to the Risk Officer. The RM never decides; decisions stay in
 * `review-service` behind the officer gate.
 */
import { prisma } from "@/lib/prisma";
import { canReviseMemo, canRmSubmit } from "@/lib/review";
import { recordAudit } from "@/services/audit-service";

import type { OfficerDecisionType } from "@/generated/prisma/enums";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Role gate for every RM entry point. Null = not an RM (admins may act). */
export async function getRmUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, fullName: true },
  });
  if (!user || (user.role !== "RELATIONSHIP_MANAGER" && user.role !== "ADMIN")) return null;
  return user;
}

/**
 * Saves a new version of the RM-refined memo. Append-only: every save adds
 * a numbered revision, so the officer always sees who changed what and when.
 */
export async function saveMemoRevision(
  rmUserId: string,
  caseId: string,
  input: { summary: string; relationshipContext?: string },
): Promise<ActionResult> {
  const rm = await getRmUser(rmUserId);
  if (!rm) return { ok: false, error: "Only Relationship Managers can refine the memo." };

  const summary = input.summary.trim();
  if (!summary) return { ok: false, error: "The executive summary cannot be empty." };
  const relationshipContext = input.relationshipContext?.trim() || null;

  const underwritingCase = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      reference: true,
      decisionIntelligence: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
      memoRevisions: { orderBy: { version: "desc" }, take: 1, select: { version: true } },
    },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };
  if (!canReviseMemo(underwritingCase.status)) {
    return {
      ok: false,
      error: "The memo can only be refined before the Risk Officer's review starts.",
    };
  }

  const version = (underwritingCase.memoRevisions[0]?.version ?? 0) + 1;
  await prisma.memoRevision.create({
    data: {
      caseId,
      authorId: rmUserId,
      decisionIntelligenceId: underwritingCase.decisionIntelligence[0]?.id ?? null,
      version,
      summary,
      relationshipContext,
    },
  });
  await recordAudit({
    action: "rm.memo_revised",
    actorId: rmUserId,
    caseId,
    detail: { reference: underwritingCase.reference, version },
  });
  return { ok: true };
}

/**
 * Routes the package to the Risk Officer: ANALYSIS_READY → RM_REVIEWED.
 * Records who routed it and when, together with the RM's suggested decision
 * — a recommendation the Risk Officer reviews and either accepts or
 * overrides; it never binds the case (the RM never decides). Routing
 * happens exactly once, so the suggestion is captured in the same
 * transaction as the status change.
 */
export async function submitToRiskOfficer(
  rmUserId: string,
  caseId: string,
  input: { decision: OfficerDecisionType; reason: string; conditions?: string },
): Promise<ActionResult> {
  const rm = await getRmUser(rmUserId);
  if (!rm) return { ok: false, error: "Only Relationship Managers can route cases." };

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required for the suggested decision." };
  const conditions = input.conditions?.trim() || null;
  if (input.decision === "APPROVE_WITH_CONDITIONS" && !conditions) {
    return { ok: false, error: "Conditions are required when suggesting approval with conditions." };
  }

  const underwritingCase = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      reference: true,
      decisionIntelligence: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };
  if (!canRmSubmit(underwritingCase.status)) {
    return {
      ok: false,
      error:
        underwritingCase.status === "RM_REVIEWED"
          ? "This case has already been routed to the Risk Officer."
          : "Only cases with a completed analysis can be routed to the Risk Officer.",
    };
  }

  await prisma.$transaction([
    prisma.rmSuggestedDecision.create({
      data: {
        caseId,
        rmId: rmUserId,
        decision: input.decision,
        reason,
        conditions: input.decision === "APPROVE_WITH_CONDITIONS" ? conditions : null,
        decisionIntelligenceId: underwritingCase.decisionIntelligence[0]?.id ?? null,
      },
    }),
    prisma.underwritingCase.update({
      where: { id: caseId },
      data: { status: "RM_REVIEWED", rmReviewerId: rmUserId, rmSubmittedAt: new Date() },
    }),
  ]);
  await recordAudit({
    action: "rm.submitted_to_risk_officer",
    actorId: rmUserId,
    caseId,
    detail: { reference: underwritingCase.reference, suggestedDecision: input.decision },
  });
  return { ok: true };
}
