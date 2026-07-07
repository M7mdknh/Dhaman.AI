/**
 * Underwriting case lifecycle. Every read is scoped by ownership (the
 * contractor's company) and every mutation is audited. Status transitions
 * are enforced HERE — never in UI or actions.
 */
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { recordAudit } from "@/services/audit-service";
import { enqueueProcessing } from "@/services/case-processing-service";

import type { ContractDetailsInput } from "@/lib/validation/case";
import type { Prisma } from "@/generated/prisma/client";

export type CaseWithRelations = Prisma.UnderwritingCaseGetPayload<{
  include: {
    company: true;
    contractDetails: true;
    documents: {
      orderBy: { fiscalYear: "desc" };
      include: { extraction: { select: { validation: true; error: true; currency: true; scale: true; detectedStatements: true } } };
    };
    financialStatements: { orderBy: { fiscalYear: "desc" } };
    // Officer decisions power the contractor-visible decision status. The AI
    // memo (decisionIntelligence) is deliberately NOT included — it is a
    // bank-internal work product since Sprint 5 (officer workspace only).
    officerDecisions: {
      orderBy: { createdAt: "desc" };
      select: { id: true; decision: true; reason: true; conditions: true; createdAt: true };
    };
    guarantee: { select: { reference: true; issueDate: true; expiryDate: true } };
    processing: true;
  };
}>;

export type CaseListItem = Prisma.UnderwritingCaseGetPayload<{
  include: { contractDetails: { select: { contractTitle: true; beneficiary: true; guaranteeAmount: true; currency: true } } };
}>;

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

/** Resolves the caller's company scope; null when not an onboarded contractor. */
async function contractorCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true },
  });
  return user?.role === "CONTRACTOR" ? user.companyId : null;
}

/** Creates a DRAFT case and mints its human-readable reference from `seq`. */
export async function createDraftCase(
  userId: string,
): Promise<ActionResult<{ caseId: string; reference: string }>> {
  const companyId = await contractorCompanyId(userId);
  if (!companyId) {
    return { ok: false, error: "Complete your company profile before creating a case." };
  }

  const created = await prisma.$transaction(async (tx) => {
    const draft = await tx.underwritingCase.create({
      data: {
        companyId,
        createdById: userId,
        reference: `TMP-${crypto.randomUUID()}`,
      },
    });
    const reference = `UC-${draft.createdAt.getFullYear()}-${String(draft.seq).padStart(6, "0")}`;
    return tx.underwritingCase.update({ where: { id: draft.id }, data: { reference } });
  });

  await recordAudit({
    action: "case.created",
    actorId: userId,
    caseId: created.id,
    detail: { reference: created.reference },
  });
  return { ok: true, data: { caseId: created.id, reference: created.reference } };
}

/** Ownership-scoped single-case read (null = not found OR not yours). */
export async function getOwnedCase(
  userId: string,
  caseId: string,
): Promise<CaseWithRelations | null> {
  const companyId = await contractorCompanyId(userId);
  if (!companyId) return null;
  return prisma.underwritingCase.findFirst({
    where: { id: caseId, companyId },
    include: {
      company: true,
      contractDetails: true,
      documents: {
        orderBy: { fiscalYear: "desc" },
        include: {
          extraction: {
            select: {
              validation: true,
              error: true,
              currency: true,
              scale: true,
              detectedStatements: true,
            },
          },
        },
      },
      financialStatements: { orderBy: { fiscalYear: "desc" } },
      officerDecisions: {
        orderBy: { createdAt: "desc" },
        select: { id: true, decision: true, reason: true, conditions: true, createdAt: true },
      },
      guarantee: { select: { reference: true, issueDate: true, expiryDate: true } },
      processing: true,
    },
  });
}

export async function listCasesForUser(userId: string): Promise<CaseListItem[]> {
  const companyId = await contractorCompanyId(userId);
  if (!companyId) return [];

  return prisma.underwritingCase.findMany({
    where: { companyId },
    include: {
      contractDetails: {
        select: { contractTitle: true, beneficiary: true, guaranteeAmount: true, currency: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export interface CaseStats {
  draft: number;
  submitted: number;
  underReview: number;
  approved: number;
}

export async function getCaseStats(userId: string): Promise<CaseStats> {
  const companyId = await contractorCompanyId(userId);
  const stats: CaseStats = { draft: 0, submitted: 0, underReview: 0, approved: 0 };
  if (!companyId) return stats;

  const groups = await prisma.underwritingCase.groupBy({
    by: ["status"],
    where: { companyId },
    _count: true,
  });
  for (const g of groups) {
    if (g.status === "DRAFT") stats.draft += g._count;
    else if (g.status === "SUBMITTED") stats.submitted += g._count;
    else if (g.status === "APPROVED" || g.status === "ISSUED") stats.approved += g._count;
    else stats.underReview += g._count; // every in-flight status between the two
  }
  return stats;
}

/** Saves wizard Step 2. Only DRAFT cases are editable. */
export async function saveContractDetails(
  userId: string,
  caseId: string,
  input: ContractDetailsInput,
): Promise<ActionResult> {
  const existing = await getOwnedCase(userId, caseId);
  if (!existing) return { ok: false, error: "Case not found." };
  if (existing.status !== "DRAFT") {
    return { ok: false, error: "Submitted cases can no longer be edited." };
  }

  // Decimal fields receive the validated strings verbatim — no float step.
  const data = {
    beneficiary: input.beneficiary,
    beneficiaryType: input.beneficiaryType,
    contractTitle: input.contractTitle,
    contractDescription: input.contractDescription || null,
    sector: input.sector,
    projectLocation: input.projectLocation,
    contractValue: input.contractValue,
    currency: input.currency,
    guaranteeAmount: input.guaranteeAmount,
    guaranteeType: input.guaranteeType,
    guaranteePercentage: input.guaranteePercentage || null,
    projectStartDate: new Date(input.projectStartDate),
    projectEndDate: new Date(input.projectEndDate),
    expectedPaymentTerms: input.expectedPaymentTerms || null,
    additionalNotes: input.additionalNotes || null,
  };

  const isUpdate = existing.contractDetails !== null;
  await prisma.contractDetails.upsert({
    where: { caseId },
    create: { caseId, ...data },
    update: data,
  });

  await recordAudit({
    action: isUpdate ? "case.draft_updated" : "case.draft_saved",
    actorId: userId,
    caseId,
    detail: { section: "contract_details" },
  });
  return { ok: true };
}

/**
 * Submission — the FIRST of two independent workflows. It only SAVES the case
 * and ARMS processing; it never runs OCR/parsing/AI. Everything below commits
 * atomically in one short transaction, then the caller triggers the async
 * pipeline out-of-band (see `submitCaseAction`).
 *
 *   DRAFT → PROCESSING   (submittedAt set, documents QUEUED, job enqueued)
 *
 * The heavy financial processing runs afterwards in `case-processing-service`
 * and drives the case to ANALYSIS_READY or PROCESSING_FAILED. A processing
 * failure never rolls this back: the case and its documents stay saved and the
 * work is retryable.
 */
export async function submitCase(userId: string, caseId: string): Promise<ActionResult> {
  const existing = await getOwnedCase(userId, caseId);
  if (!existing) return { ok: false, error: "Case not found." };
  if (existing.status !== "DRAFT") {
    return { ok: false, error: "This case has already been submitted." };
  }
  if (!existing.contractDetails) {
    return { ok: false, error: "Complete the contract details before submitting." };
  }
  if (!existing.documents.some((d) => d.docType === "FINANCIAL_STATEMENT")) {
    return { ok: false, error: "Upload at least one audited financial statement before submitting." };
  }

  // One fast, atomic write: the case is saved and processing is armed together.
  await prisma.$transaction(async (tx) => {
    await tx.underwritingCase.update({
      where: { id: caseId },
      data: { status: "PROCESSING", submittedAt: new Date() },
    });
    await tx.document.updateMany({
      where: { caseId, docType: "FINANCIAL_STATEMENT" },
      data: { processingStatus: "QUEUED" },
    });
    await enqueueProcessing(tx, caseId);
  });

  await recordAudit({
    action: "case.submitted",
    actorId: userId,
    caseId,
    detail: { reference: existing.reference },
  });
  return { ok: true };
}

/** Deletes a DRAFT case, its rows (cascade) and its stored files. */
export async function deleteDraftCase(userId: string, caseId: string): Promise<ActionResult> {
  const existing = await getOwnedCase(userId, caseId);
  if (!existing) return { ok: false, error: "Case not found." };
  if (existing.status !== "DRAFT") {
    return { ok: false, error: "Only draft cases can be deleted." };
  }

  await prisma.underwritingCase.delete({ where: { id: caseId } });

  // Best effort after the DB delete; orphaned files are harmless.
  await Promise.allSettled(existing.documents.map((d) => storage.remove(d.storageKey)));

  await recordAudit({
    action: "case.draft_deleted",
    actorId: userId,
    detail: { reference: existing.reference },
  });
  return { ok: true };
}
