/**
 * Underwriting case lifecycle. Every read is scoped by ownership (the
 * contractor's company) and every mutation is audited. Status transitions
 * are enforced HERE — never in UI or actions.
 */
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { recordAudit } from "@/services/audit-service";
import { processCaseDocuments } from "@/services/extraction-service";

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
 * DRAFT → SUBMITTED → PARSING → ANALYSIS_READY, in one request.
 *
 * IFRS extraction runs BEFORE the case leaves DRAFT: an unusable document
 * (scanned, password-protected, missing statements) rejects the submission
 * with a per-file message so the contractor can replace it immediately.
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

  const pipeline = await processCaseDocuments(caseId, userId);
  if (!pipeline.ok) {
    const details = pipeline.failures
      .map((f) => `${f.fileName}: ${f.message}`)
      .join(" ");
    return {
      ok: false,
      error:
        details ||
        "No usable financial figures could be extracted from the uploaded statements.",
    };
  }

  await prisma.underwritingCase.update({
    where: { id: caseId },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  await recordAudit({
    action: "case.submitted",
    actorId: userId,
    caseId,
    detail: { reference: existing.reference, extractedYears: pipeline.years },
  });

  // Extraction already succeeded; PARSING is recorded as a real (if brief)
  // lifecycle stage, then the case becomes ready for analysis.
  await prisma.underwritingCase.update({
    where: { id: caseId },
    data: { status: "PARSING" },
  });
  await prisma.underwritingCase.update({
    where: { id: caseId },
    data: { status: "ANALYSIS_READY" },
  });
  await recordAudit({
    action: "case.analysis_ready",
    actorId: userId,
    caseId,
    detail: { years: pipeline.years, warnings: pipeline.warnings.length },
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
