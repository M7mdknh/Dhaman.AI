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
 * Records who routed it and when. The officer can also start directly from
 * ANALYSIS_READY — the RM stage improves the package, it never blocks it.
 */
export async function submitToRiskOfficer(
  rmUserId: string,
  caseId: string,
): Promise<ActionResult> {
  const rm = await getRmUser(rmUserId);
  if (!rm) return { ok: false, error: "Only Relationship Managers can route cases." };

  const underwritingCase = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: { status: true, reference: true },
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

  await prisma.underwritingCase.update({
    where: { id: caseId },
    data: { status: "RM_REVIEWED", rmReviewerId: rmUserId, rmSubmittedAt: new Date() },
  });
  await recordAudit({
    action: "rm.submitted_to_risk_officer",
    actorId: rmUserId,
    caseId,
    detail: { reference: underwritingCase.reference },
  });
  return { ok: true };
}
