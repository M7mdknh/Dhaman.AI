/**
 * Officer-side case access (Sprint 5). A deliberately SEPARATE read path
 * from the contractor's ownership-scoped `case-service`: officers see every
 * post-submission case, gated on role — never on company ownership.
 */
import { buildFinancialIntelligence } from "@/services/finance/financial-intelligence-service";
import { recordAudit } from "@/services/audit-service";
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
      company: { select: { name: true } },
      contractDetails: true,
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
        ? buildFinancialIntelligence(item.financialStatements, item.contractDetails)
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
      riskScore: report?.risk.score ?? null,
      riskBand: report?.risk.band ?? null,
      priority: derivePriority(
        report?.risk.band ?? null,
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
