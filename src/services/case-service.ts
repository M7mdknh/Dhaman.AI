/**
 * Underwriting case lifecycle. Every read is scoped by ownership (the
 * contractor's company) and every mutation is audited. Status transitions
 * are enforced HERE — never in UI or actions.
 */
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { recordAudit } from "@/services/audit-service";
import { enqueueProcessing } from "@/services/case-processing-service";

import { Prisma } from "@/generated/prisma/client";

import type { CaseQualitativeInput, ContractDetailsInput } from "@/lib/validation/case";

export type CaseWithRelations = Prisma.UnderwritingCaseGetPayload<{
  include: {
    company: true;
    contractDetails: true;
    qualitative: true;
    documents: {
      orderBy: { fiscalYear: "desc" };
      include: { extraction: { select: { validation: true; error: true; currency: true; scale: true; detectedStatements: true; companyName: true } } };
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
      qualitative: true,
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
              companyName: true,
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

/** "YES"/"NO" select values → boolean (validation guarantees the domain). */
const yes = (v: string | undefined) => v === "YES";
/** Optional textarea → trimmed value or null. */
const noteOrNull = (v: string | undefined) => {
  const trimmed = (v ?? "").trim();
  return trimmed ? trimmed : null;
};

/**
 * Saves wizard Step 2 — the KYC questionnaire (CaseQualitative). Answered
 * fresh on every case (never pre-filled): each underwriting decision keeps
 * the exact answers it was made under, and answer drift between a company's
 * cases is visible to the officer.
 */
export async function saveCaseQualitative(
  userId: string,
  caseId: string,
  input: CaseQualitativeInput,
): Promise<ActionResult> {
  const existing = await getOwnedCase(userId, caseId);
  if (!existing) return { ok: false, error: "Case not found." };
  if (existing.status !== "DRAFT") {
    return { ok: false, error: "Submitted cases can no longer be edited." };
  }

  const classification =
    !input.contractorClassification || input.contractorClassification === "NONE"
      ? null
      : input.contractorClassification;

  const data = {
    crIssueDate: new Date(input.crIssueDate),
    crActivities: input.crActivities,
    contractorClassification: classification,
    partOfGroup: yes(input.partOfGroup),
    groupName: yes(input.partOfGroup) ? noteOrNull(input.groupName) : null,
    gmName: input.gmName,
    gmExperienceYears: Number(input.gmExperienceYears),
    ownershipChanged: yes(input.ownershipChanged),
    ownershipChangeNote: yes(input.ownershipChanged) ? noteOrNull(input.ownershipChangeNote) : null,
    nitaqatBand: input.nitaqatBand,
    ongoingLitigation: yes(input.ongoingLitigation),
    litigationNote: yes(input.ongoingLitigation) ? noteOrNull(input.litigationNote) : null,
    projectsCompletedBand: input.projectsCompletedBand,
    largestProjectValue: input.largestProjectValue,
    hadProjectIssues: yes(input.hadProjectIssues),
    projectIssuesNote: yes(input.hadProjectIssues) ? noteOrNull(input.projectIssuesNote) : null,
    guaranteeCalled: yes(input.guaranteeCalled),
    guaranteeCalledNote: yes(input.guaranteeCalled) ? noteOrNull(input.guaranteeCalledNote) : null,
    sameTypeExperience: yes(input.sameTypeExperience),
    sameTypeExperienceNote: noteOrNull(input.sameTypeExperienceNote),
    runningProjectsCount: Number(input.runningProjectsCount),
    backlogValue: input.backlogValue,
    outstandingGuarantees: input.outstandingGuarantees,
    equipmentPlan: input.equipmentPlan,
    heavyHiringNeeded: yes(input.heavyHiringNeeded),
    mainBank: input.mainBank,
    conductIncidents: yes(input.conductIncidents),
    conductIncidentsNote: yes(input.conductIncidents) ? noteOrNull(input.conductIncidentsNote) : null,
    auditorTier: input.auditorTier,
    auditorName: input.auditorTier === "UNAUDITED" ? null : noteOrNull(input.auditorName),
    fundingSource: input.fundingSource,
  };

  const isUpdate = existing.qualitative !== null;
  await prisma.caseQualitative.upsert({
    where: { caseId },
    create: { caseId, ...data },
    update: data,
  });

  await recordAudit({
    action: isUpdate ? "case.draft_updated" : "case.draft_saved",
    actorId: userId,
    caseId,
    detail: { section: "kyc_questionnaire" },
  });
  return { ok: true };
}

/** Saves wizard Step 3 (contract details). Only DRAFT cases are editable. */
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

  const data = contractDetailsData(input);

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
 * Validated contract input → ContractDetails column values. Shared by the
 * contractor's draft save and the admin override so the two writes can
 * never drift apart. Decimal fields receive the validated strings verbatim
 * — no float step; the guarantee amount is always DERIVED from the ratio
 * (guaranteeAmount = contractValue * ratio / 100) via precise Decimal math.
 */
export function contractDetailsData(input: ContractDetailsInput) {
  const guaranteeAmount = new Prisma.Decimal(input.contractValue)
    .times(input.guaranteePercentage)
    .dividedBy(100)
    .toFixed(2);

  return {
    beneficiary: input.beneficiary,
    beneficiaryType: input.beneficiaryType,
    contractTitle: input.contractTitle,
    contractDescription: input.contractDescription || null,
    sector: input.sector,
    projectLocation: input.projectLocation,
    contractValue: input.contractValue,
    currency: input.currency,
    guaranteeAmount,
    guaranteeType: input.guaranteeType,
    guaranteePercentage: input.guaranteePercentage,
    projectStartDate: new Date(input.projectStartDate),
    projectEndDate: new Date(input.projectEndDate),
    additionalNotes: input.additionalNotes || null,
    // 2A — contractor role (subcontractor fields cleared for a main contractor)
    contractorRole: input.contractorRole,
    mainContractorName:
      input.contractorRole === "SUBCONTRACTOR" ? input.mainContractorName?.trim() || null : null,
    backToBackPayment:
      input.contractorRole === "SUBCONTRACTOR" ? input.backToBackPayment === "YES" : null,
    awardMethod: input.awardMethod,
    priorContractsWithBeneficiary: Number(input.priorContractsWithBeneficiary),
    // 2B — payment mechanics
    advancePaymentPct: input.advancePaymentPct,
    billingCycle: input.billingCycle,
    retentionPct: input.retentionPct,
    paymentPeriodDays: Number(input.paymentPeriodDays),
    paymentNotes: input.paymentNotes?.trim() || null,
    // 2C — bond requirements
    requiredBondPct: input.requiredBondPct,
    bondValidityDate: new Date(input.bondValidityDate),
    onFirstDemand: input.onFirstDemand === "YES",
    extendOrPay: input.extendOrPay === "YES",
    // 2D — penalty clauses
    ldRatePctPerWeek: input.ldRatePctPerWeek,
    ldCapPct: input.ldCapPct,
    // 2E — execution plan
    mobilizationWeeks: Number(input.mobilizationWeeks),
    keySuppliersIdentified: input.keySuppliersIdentified === "YES",
    keySuppliersNote: input.keySuppliersNote?.trim() || null,
    expectedGrossMarginPct: input.expectedGrossMarginPct,
  };
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
  if (!existing.qualitative) {
    return { ok: false, error: "Complete the KYC questionnaire before submitting." };
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
