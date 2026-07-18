/**
 * Officer-side case access (Sprint 5). A deliberately SEPARATE read path
 * from the contractor's ownership-scoped `case-service`: officers see every
 * post-submission case, gated on role — never on company ownership.
 */
import {
  buildFinancialIntelligence,
  toIdentityInputs,
} from "@/services/finance/financial-intelligence-service";
import { validateFinancialIntegrity } from "@/services/finance/financial-integrity-validator";
import { recordAudit } from "@/services/audit-service";
import {
  beneficiaryTypeLabel,
  CASE_STATUS_LABELS,
  guaranteeTypeLabel,
} from "@/lib/case-constants";
import { buildValidationReport } from "@/lib/finance/confidence";
import { renderFinancialAnalysisPdf } from "@/lib/pdf/financial-analysis-pdf";
import { renderUnderwritingPackagePdf } from "@/lib/pdf/underwriting-package-pdf";
import { prisma } from "@/lib/prisma";
import {
  DECIDED_STATUSES,
  PENDING_STATUSES,
  QUEUE_STATUSES,
  derivePriority,
  type CasePriority,
} from "@/lib/review";

import type { Prisma } from "@/generated/prisma/client";
import type { CaseStatus } from "@/generated/prisma/enums";
import type { RiskBand } from "@/lib/finance/types";

/** Officers opening the same case repeatedly within this window are not re-audited. */
const OPEN_AUDIT_DEDUP_MS = 15 * 60 * 1000;

export const QUEUE_PAGE_SIZE = 15;

export type QueueTab = "pending" | "all" | "decided";

/** Role gate for decision-making entry points. Null = not an officer/admin. */
export async function getOfficerUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, fullName: true },
  });
  if (!user || (user.role !== "RISK_OFFICER" && user.role !== "ADMIN")) return null;
  return user;
}

/**
 * Role gate for bank-side READ paths and memo work: Relationship Managers
 * see the same queue and case detail as officers — but decisions, guarantee
 * issuance, and review lifecycle stay behind `getOfficerUser`.
 */
export async function getBankUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, fullName: true },
  });
  if (
    !user ||
    (user.role !== "RELATIONSHIP_MANAGER" && user.role !== "RISK_OFFICER" && user.role !== "ADMIN")
  ) {
    return null;
  }
  return user;
}

export type ReviewCase = Prisma.UnderwritingCaseGetPayload<{
  include: {
    company: true;
    createdBy: { select: { fullName: true; email: true } };
    assignedOfficer: { select: { id: true; fullName: true } };
    rmReviewer: { select: { id: true; fullName: true } };
    contractDetails: true;
    qualitative: true;
    documents: {
      include: {
        extraction: {
          select: {
            validation: true;
            error: true;
            currency: true;
            scale: true;
            detectedStatements: true;
            companyName: true;
          };
        };
      };
    };
    financialStatements: true;
    decisionIntelligence: true;
    officerDecisions: { include: { officer: { select: { fullName: true } } } };
    rmSuggestedDecisions: { include: { rm: { select: { fullName: true } } } };
    notes: { include: { author: { select: { fullName: true } } } };
    memoRevisions: { include: { author: { select: { fullName: true } } } };
    guarantee: true;
  };
}>;

/**
 * Full case read for the review workspace. Audits `officer.case_opened`
 * (deduplicated per officer/case within a short window so refreshes and
 * post-action re-renders don't flood the trail).
 */
export async function getCaseForReview(
  officerUserId: string,
  caseId: string,
): Promise<ReviewCase | null> {
  const officer = await getBankUser(officerUserId);
  if (!officer) return null;

  const underwritingCase = await prisma.underwritingCase.findFirst({
    // Officers never see drafts — a case exists for the bank at submission.
    where: { id: caseId, status: { not: "DRAFT" } },
    include: {
      company: true,
      createdBy: { select: { fullName: true, email: true } },
      assignedOfficer: { select: { id: true, fullName: true } },
      rmReviewer: { select: { id: true, fullName: true } },
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
      decisionIntelligence: { orderBy: { createdAt: "desc" }, take: 1 },
      officerDecisions: {
        orderBy: { createdAt: "desc" },
        include: { officer: { select: { fullName: true } } },
      },
      rmSuggestedDecisions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { rm: { select: { fullName: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { fullName: true } } },
      },
      memoRevisions: {
        orderBy: { version: "desc" },
        include: { author: { select: { fullName: true } } },
      },
      guarantee: true,
    },
  });
  if (!underwritingCase) return null;

  const recentOpen = await prisma.auditLog.findFirst({
    where: {
      caseId,
      actorId: officerUserId,
      action: "officer.case_opened",
      createdAt: { gte: new Date(Date.now() - OPEN_AUDIT_DEDUP_MS) },
    },
    select: { id: true },
  });
  if (!recentOpen) {
    await recordAudit({
      action: "officer.case_opened",
      actorId: officerUserId,
      caseId,
      detail: { reference: underwritingCase.reference, status: underwritingCase.status },
    });
  }

  return underwritingCase;
}

/** Flat, serializable queue row (Decimal/Date flattened for the client). */
export interface QueueRow {
  id: string;
  reference: string;
  status: CaseStatus;
  companyName: string;
  contractTitle: string | null;
  beneficiary: string | null;
  guaranteeAmount: string | null;
  currency: string;
  submittedAt: string | null; // ISO
  updatedAt: string; // ISO
  capacityScore: number | null;
  riskScore: number | null;
  riskBand: RiskBand | null;
  priority: CasePriority;
  assignedOfficer: string | null;
}

export interface QueueResult {
  rows: QueueRow[];
  total: number;
  page: number;
  pageCount: number;
}

export interface QueueStats {
  pending: number;
  underReview: number;
  decided: number;
  issued: number;
}

function tabStatuses(tab: QueueTab): CaseStatus[] {
  if (tab === "pending") return PENDING_STATUSES;
  if (tab === "decided") return DECIDED_STATUSES;
  return QUEUE_STATUSES;
}

/**
 * Paginated review queue. Capacity/risk are recomputed per row by the
 * deterministic engines (cheap pure functions — the same rule as the
 * analysis page: computed on demand, never stale).
 */
export async function listReviewQueue(
  officerUserId: string,
  options: { tab: QueueTab; query?: string; page?: number },
): Promise<QueueResult | null> {
  const officer = await getBankUser(officerUserId);
  if (!officer) return null;

  const query = options.query?.trim();
  const where: Prisma.UnderwritingCaseWhereInput = {
    status: { in: tabStatuses(options.tab) },
    ...(query
      ? {
          OR: [
            { reference: { contains: query, mode: "insensitive" } },
            { company: { name: { contains: query, mode: "insensitive" } } },
            { contractDetails: { contractTitle: { contains: query, mode: "insensitive" } } },
            { contractDetails: { beneficiary: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await prisma.underwritingCase.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

  const cases = await prisma.underwritingCase.findMany({
    where,
    include: {
      company: { select: { name: true, sector: true } },
      contractDetails: true,
      qualitative: true,
      financialStatements: true,
      assignedOfficer: { select: { fullName: true } },
    },
    // Pending: oldest submission first (FIFO fairness); otherwise most recent activity.
    orderBy: options.tab === "pending" ? { submittedAt: "asc" } : { updatedAt: "desc" },
    skip: (page - 1) * QUEUE_PAGE_SIZE,
    take: QUEUE_PAGE_SIZE,
  });

  const rows = cases.map((item): QueueRow => {
    const report =
      item.contractDetails && item.financialStatements.length > 0
        ? buildFinancialIntelligence(
            item.financialStatements,
            item.contractDetails,
            null,
            item.qualitative,
            item.company.sector,
          )
        : null;
    return {
      id: item.id,
      reference: item.reference,
      status: item.status,
      companyName: item.company.name,
      contractTitle: item.contractDetails?.contractTitle ?? null,
      beneficiary: item.contractDetails?.beneficiary ?? null,
      guaranteeAmount: item.contractDetails?.guaranteeAmount.toString() ?? null,
      currency: item.contractDetails?.currency ?? "SAR",
      submittedAt: item.submittedAt?.toISOString() ?? null,
      updatedAt: item.updatedAt.toISOString(),
      capacityScore: report?.capacity?.score ?? null,
      // The queue ranks by the composite grade (all three pillars), which
      // renormalizes to the financial score alone on pre-KYC cases.
      riskScore: report?.overall.score ?? null,
      riskBand: report?.overall.band ?? null,
      priority: derivePriority(
        report?.overall.band ?? null,
        item.contractDetails?.guaranteeAmount ?? null,
      ),
      assignedOfficer: item.assignedOfficer?.fullName ?? null,
    };
  });

  return { rows, total, page, pageCount };
}

/**
 * The platform's north-star metric (framework §4.16): average time from
 * submission to a completed assessment, measured over every COMPLETED
 * processing job (queuedAt → completedAt). Deterministic, computed live.
 */
export interface ProcessingSla {
  averageSeconds: number;
  count: number;
}

export async function getProcessingSla(officerUserId: string): Promise<ProcessingSla | null> {
  const user = await getBankUser(officerUserId);
  if (!user) return null;

  const jobs = await prisma.caseProcessing.findMany({
    where: { state: "COMPLETED", completedAt: { not: null } },
    select: { queuedAt: true, completedAt: true },
  });
  if (jobs.length === 0) return { averageSeconds: 0, count: 0 };

  const totalMs = jobs.reduce(
    (sum, job) => sum + (job.completedAt!.getTime() - job.queuedAt.getTime()),
    0,
  );
  return { averageSeconds: totalMs / jobs.length / 1000, count: jobs.length };
}

/** One lightweight hit for the ⌘K command palette (no engine recompute). */
export interface PaletteHit {
  id: string;
  reference: string;
  company: string;
  status: CaseStatus;
}

/**
 * Fast, minimal case search for the command palette — reference / company /
 * contract, over every post-submission case. Gated to bank staff. Bounded to
 * a small page: the palette is a jump-to, not a report.
 */
export async function searchCasesForPalette(
  userId: string,
  query: string,
): Promise<PaletteHit[]> {
  const staff = await getBankUser(userId);
  if (!staff) return [];

  const q = query.trim();
  const where: Prisma.UnderwritingCaseWhereInput = {
    status: { not: "DRAFT" },
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { company: { name: { contains: q, mode: "insensitive" } } },
            { contractDetails: { contractTitle: { contains: q, mode: "insensitive" } } },
            { contractDetails: { beneficiary: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const cases = await prisma.underwritingCase.findMany({
    where,
    select: { id: true, reference: true, status: true, company: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  return cases.map((c) => ({
    id: c.id,
    reference: c.reference,
    company: c.company.name,
    status: c.status,
  }));
}

export async function getQueueStats(officerUserId: string): Promise<QueueStats | null> {
  const officer = await getBankUser(officerUserId);
  if (!officer) return null;

  const groups = await prisma.underwritingCase.groupBy({
    by: ["status"],
    where: { status: { in: QUEUE_STATUSES } },
    _count: true,
  });
  const count = (statuses: CaseStatus[]) =>
    groups.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count, 0);

  return {
    pending: count(PENDING_STATUSES),
    underReview: count(["UNDER_REVIEW", "INFO_REQUESTED"]),
    decided: count(["APPROVED", "DECLINED"]),
    issued: count(["ISSUED"]),
  };
}

/**
 * Financial Intelligence Report PDF (bank-side export). Rendered on demand
 * from the deterministic engine's already-computed output — never stored,
 * nothing recalculated. Gated to bank staff: the analysis is bank-internal,
 * the contractor only submits and tracks status.
 */
export async function getFinancialAnalysisPdf(
  userId: string,
  caseId: string,
): Promise<
  { ok: true; data: { fileName: string; bytes: Uint8Array } } | { ok: false; error: string }
> {
  const staff = await getBankUser(userId);
  if (!staff) return { ok: false, error: "Only bank staff can export the financial analysis." };

  const underwritingCase = await prisma.underwritingCase.findFirst({
    where: { id: caseId, status: { not: "DRAFT" } },
    include: {
      company: { select: { name: true, crNumber: true, sector: true } },
      contractDetails: true,
      qualitative: true,
      financialStatements: { orderBy: { fiscalYear: "desc" } },
      documents: {
        select: { fiscalYear: true, extraction: { select: { companyName: true } } },
      },
    },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };

  const report = buildFinancialIntelligence(
    underwritingCase.financialStatements,
    underwritingCase.contractDetails,
    toIdentityInputs(underwritingCase.company.name, underwritingCase.documents),
    underwritingCase.qualitative,
    underwritingCase.company.sector,
  );
  if (!report) {
    return {
      ok: false,
      error: "No validated financial analysis exists for this case yet — nothing to export.",
    };
  }

  const bytes = await renderFinancialAnalysisPdf({
    caseReference: underwritingCase.reference,
    companyName: underwritingCase.company.name,
    crNumber: underwritingCase.company.crNumber,
    contractTitle: underwritingCase.contractDetails?.contractTitle ?? "—",
    guaranteeAmount: underwritingCase.contractDetails?.guaranteeAmount.toString() ?? "0",
    currency: underwritingCase.contractDetails?.currency ?? "SAR",
    generatedAt: new Date(),
    report,
  });

  await recordAudit({
    action: "officer.analysis_pdf_downloaded",
    actorId: userId,
    caseId,
    detail: { reference: underwritingCase.reference },
  });
  return {
    ok: true,
    data: { fileName: `${underwritingCase.reference}-financial-analysis.pdf`, bytes },
  };
}

/**
 * Underwriting Package PDF (bank-side export): the complete case file —
 * company, contract, Financial Intelligence, AI memo, RM assessment, and the
 * Risk Officer decision (explicit "Pending"/"Not completed" placeholders for
 * stages that have not happened). One template serves every workflow stage.
 * Rendered on demand from live rows; nothing stored, nothing recalculated by
 * hand — the deterministic engines produce every figure.
 */
export async function getUnderwritingPackagePdf(
  userId: string,
  caseId: string,
): Promise<
  { ok: true; data: { fileName: string; bytes: Uint8Array } } | { ok: false; error: string }
> {
  const staff = await getBankUser(userId);
  if (!staff) return { ok: false, error: "Only bank staff can export the underwriting package." };

  const underwritingCase = await prisma.underwritingCase.findFirst({
    where: { id: caseId, status: { not: "DRAFT" } },
    include: {
      company: true,
      contractDetails: true,
      qualitative: true,
      financialStatements: { orderBy: { fiscalYear: "desc" } },
      documents: { select: { docType: true, fiscalYear: true, processingStatus: true, extraction: { select: { companyName: true } } } },
      decisionIntelligence: { orderBy: { createdAt: "desc" }, take: 1 },
      memoRevisions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { author: { select: { fullName: true } } },
      },
      rmSuggestedDecisions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { rm: { select: { fullName: true } } },
      },
      rmReviewer: { select: { fullName: true } },
      officerDecisions: {
        orderBy: { createdAt: "desc" },
        include: { officer: { select: { fullName: true } } },
      },
      guarantee: true,
    },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };

  const report = buildFinancialIntelligence(
    underwritingCase.financialStatements,
    underwritingCase.contractDetails,
    toIdentityInputs(underwritingCase.company.name, underwritingCase.documents),
    underwritingCase.qualitative,
    underwritingCase.company.sector,
  );
  const integrity = validateFinancialIntegrity(underwritingCase.financialStatements);
  const unreadYears = underwritingCase.documents
    .filter(
      (d) =>
        d.docType === "FINANCIAL_STATEMENT" &&
        d.processingStatus === "FAILED" &&
        d.fiscalYear !== null &&
        !underwritingCase.financialStatements.some((s) => s.fiscalYear === d.fiscalYear),
    )
    .map((d) => d.fiscalYear!)
    .sort((a, b) => b - a);
  const validation = buildValidationReport(integrity, unreadYears);

  const memo = underwritingCase.decisionIntelligence[0] ?? null;
  const revision = underwritingCase.memoRevisions[0] ?? null;
  const suggested = underwritingCase.rmSuggestedDecisions[0] ?? null;
  // The decision of record: the newest terminal decision (REQUEST_INFO pauses
  // the review; it never decides the case).
  const terminalDecision =
    underwritingCase.officerDecisions.find((d) => d.decision !== "REQUEST_INFO") ?? null;
  const contract = underwritingCase.contractDetails;

  const bytes = await renderUnderwritingPackagePdf({
    caseReference: underwritingCase.reference,
    statusLabel: CASE_STATUS_LABELS[underwritingCase.status],
    generatedAt: new Date(),
    submittedAt: underwritingCase.submittedAt,
    company: {
      name: underwritingCase.company.name,
      crNumber: underwritingCase.company.crNumber,
      sector: underwritingCase.company.sector,
      city: underwritingCase.company.city,
      contactPerson: underwritingCase.company.contactPerson ?? "—",
    },
    contract: contract
      ? {
          title: contract.contractTitle,
          beneficiary: contract.beneficiary,
          beneficiaryType: beneficiaryTypeLabel(contract.beneficiaryType),
          guaranteeType: guaranteeTypeLabel(contract.guaranteeType),
          guaranteeAmount: contract.guaranteeAmount.toString(),
          guaranteePercentage: contract.guaranteePercentage.toString(),
          contractValue: contract.contractValue.toString(),
          currency: contract.currency,
          projectLocation: contract.projectLocation,
          projectStartDate: contract.projectStartDate,
          projectEndDate: contract.projectEndDate,
        }
      : null,
    report,
    validation: {
      confidenceLabel: validation.confidence.label,
      summary: validation.summary,
    },
    memo: memo
      ? {
          summary: memo.summary,
          strengths: memo.companyStrengths,
          weaknesses: memo.companyWeaknesses,
          riskExplanation: memo.riskExplanation,
          recommendationLabel: recommendationLabel(memo.recommendation),
          recommendationReason: memo.recommendationReason,
          confidenceExplanation: memo.confidenceExplanation,
          nextSteps: memo.nextSteps,
          aiDiverged: memo.aiDiverged,
          aiRecommendationLabel: recommendationLabel(memo.aiRecommendation),
          provider: memo.provider,
          model: memo.model,
          promptVersion: memo.promptVersion,
          createdAt: memo.createdAt,
        }
      : null,
    rm: {
      revision: revision
        ? {
            version: revision.version,
            summary: revision.summary,
            relationshipContext: revision.relationshipContext,
            author: revision.author?.fullName ?? "Former staff member",
            createdAt: revision.createdAt,
          }
        : null,
      suggested: suggested
        ? {
            decisionLabel: decisionLabel(suggested.decision),
            reason: suggested.reason,
            conditions: suggested.conditions,
            rm: suggested.rm.fullName,
            createdAt: suggested.createdAt,
          }
        : null,
      routedBy: underwritingCase.rmReviewer?.fullName ?? null,
      routedAt: underwritingCase.rmSubmittedAt,
    },
    decision: terminalDecision
      ? {
          decisionLabel: decisionLabel(terminalDecision.decision),
          officer: terminalDecision.officer.fullName,
          date: terminalDecision.createdAt,
          reason: terminalDecision.reason,
          conditions: terminalDecision.conditions,
        }
      : null,
    guarantee: underwritingCase.guarantee
      ? {
          reference: underwritingCase.guarantee.reference,
          issueDate: underwritingCase.guarantee.issueDate,
          expiryDate: underwritingCase.guarantee.expiryDate,
        }
      : null,
  });

  await recordAudit({
    action: "officer.package_pdf_downloaded",
    actorId: userId,
    caseId,
    detail: { reference: underwritingCase.reference, status: underwritingCase.status },
  });
  return {
    ok: true,
    data: { fileName: `${underwritingCase.reference}-underwriting-package.pdf`, bytes },
  };
}

/** Display labels for decisions/recommendations, shared with the UI vocabulary. */
const DECISION_LABELS: Record<string, string> = {
  APPROVE: "Approve",
  APPROVE_WITH_CONDITIONS: "Approve with Conditions",
  REJECT: "Reject",
  REQUEST_INFO: "Request More Information",
};
function decisionLabel(value: string): string {
  return DECISION_LABELS[value] ?? value;
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  APPROVE: "Approve",
  APPROVE_WITH_CONDITIONS: "Approve with Conditions",
  MANUAL_REVIEW: "Manual Review",
  REJECT: "Reject",
};
function recommendationLabel(value: string): string {
  return RECOMMENDATION_LABELS[value] ?? value;
}
