/**
 * Administrator case management. A deliberately narrow surface: admins can
 * correct a case's contract details (e.g. a genuine data-entry error the
 * contractor can no longer edit themselves once submitted) or remove a case
 * entirely — both audited, both gated to ADMIN only.
 */
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { recordAudit } from "@/services/audit-service";
import { contractDetailsData } from "@/services/case-service";

import type { ContractDetailsInput } from "@/lib/validation/case";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Role gate for every admin case-management entry point. */
export async function getAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, fullName: true },
  });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

/**
 * Overwrites a case's contract details regardless of status. Unlike the
 * contractor's own edit path (blocked once submitted, to protect the
 * historical record a decision was made against), an admin correction is a
 * deliberate, audited override — e.g. fixing a typo the RM/officer already
 * flagged. The guarantee amount is always rederived from the ratio, exactly
 * like the contractor's own save path, so it can never drift out of sync.
 */
export async function adminUpdateContractDetails(
  adminUserId: string,
  caseId: string,
  input: ContractDetailsInput,
): Promise<ActionResult> {
  const admin = await getAdminUser(adminUserId);
  if (!admin) return { ok: false, error: "Only administrators can edit a submitted case." };

  const existing = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: { reference: true, contractDetails: { select: { id: true } } },
  });
  if (!existing) return { ok: false, error: "Case not found." };
  if (!existing.contractDetails) {
    return { ok: false, error: "This case has no contract details to edit." };
  }

  await prisma.contractDetails.update({
    where: { caseId },
    // The exact same input → column mapping as the contractor's own save
    // path (shared helper), so an admin correction can never drift from it.
    data: contractDetailsData(input),
  });

  await recordAudit({
    action: "admin.case_edited",
    actorId: adminUserId,
    caseId,
    detail: { reference: existing.reference },
  });
  return { ok: true };
}

/**
 * Deletes a case outright — any status, not just drafts. An ISSUED guarantee
 * is a real bank instrument (`Guarantee.case` is onDelete: Restrict at the
 * schema level for exactly this reason) and must never disappear because a
 * case row was removed, so deletion is refused while one exists.
 */
export async function adminDeleteCase(adminUserId: string, caseId: string): Promise<ActionResult> {
  const admin = await getAdminUser(adminUserId);
  if (!admin) return { ok: false, error: "Only administrators can delete a case." };

  const existing = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: {
      reference: true,
      guarantee: { select: { reference: true } },
      documents: { select: { storageKey: true } },
    },
  });
  if (!existing) return { ok: false, error: "Case not found." };
  if (existing.guarantee) {
    return {
      ok: false,
      error:
        `This case has an issued Letter of Guarantee (${existing.guarantee.reference}) — an ` +
        "issued bank instrument can never be deleted along with its case.",
    };
  }

  await prisma.underwritingCase.delete({ where: { id: caseId } });

  // Best effort after the DB delete; orphaned files are harmless.
  await Promise.allSettled(existing.documents.map((d) => storage.remove(d.storageKey)));

  await recordAudit({
    action: "admin.case_deleted",
    actorId: adminUserId,
    detail: { reference: existing.reference },
  });
  return { ok: true };
}
