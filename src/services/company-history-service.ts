/**
 * Company history — the company as the parent entity its contracts hang off.
 * Derived entirely from the company's cases (never duplicated state): all
 * contracts, guarantees, decision outcomes, and the bank's own aggregate
 * exposure to the company. Powers the bank-side company page and the
 * Insight Chat's cross-case context ("what else does this company have
 * with us?"), and is the within-Daman replacement for the deferred SIMAH
 * over-issuance check.
 *
 * Bank staff only — a contractor sees their own cases via the dashboard.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getBankUser } from "@/services/officer-case-service";

export interface CompanyCaseSummary {
  id: string;
  reference: string;
  status: string;
  submittedAt: string | null; // ISO
  decidedAt: string | null; // ISO
  contractTitle: string | null;
  beneficiary: string | null;
  sector: string | null;
  contractValue: string | null;
  guaranteeType: string | null;
  guaranteeAmount: string | null;
  currency: string;
  latestDecision: string | null;
  guaranteeReference: string | null;
  guaranteeExpiryDate: string | null; // ISO date
}

export interface CompanyHistory {
  company: {
    id: string;
    name: string;
    crNumber: string;
    sector: string;
    city: string;
    createdAt: string; // ISO
  };
  cases: CompanyCaseSummary[];
  totals: {
    totalCases: number;
    approved: number;
    declined: number;
    inFlight: number;
    /** Issued, unexpired guarantees. */
    activeGuarantees: number;
    /** Sum of issued, unexpired guarantee amounts (decimal string, SAR-major). */
    activeGuaranteeExposure: string;
    /** Sum of requested guarantee amounts on undecided cases. */
    pendingGuaranteeExposure: string;
  };
}

const DECIDED: Record<string, "approved" | "declined"> = {
  APPROVED: "approved",
  ISSUED: "approved",
  DECLINED: "declined",
};

function buildHistory(
  company: {
    id: string;
    name: string;
    crNumber: string;
    sector: string;
    city: string;
    createdAt: Date;
  },
  cases: {
    id: string;
    reference: string;
    status: string;
    submittedAt: Date | null;
    decidedAt: Date | null;
    contractDetails: {
      contractTitle: string;
      beneficiary: string;
      sector: string;
      contractValue: Prisma.Decimal;
      guaranteeType: string;
      guaranteeAmount: Prisma.Decimal;
      currency: string;
    } | null;
    officerDecisions: { decision: string }[];
    guarantee: { reference: string; amount: Prisma.Decimal; expiryDate: Date } | null;
  }[],
): CompanyHistory {
  const now = new Date();
  let active = new Prisma.Decimal(0);
  let pending = new Prisma.Decimal(0);
  let activeCount = 0;
  let approved = 0;
  let declined = 0;
  let inFlight = 0;

  for (const c of cases) {
    const outcome = DECIDED[c.status];
    if (outcome === "approved") approved += 1;
    else if (outcome === "declined") declined += 1;
    else inFlight += 1;

    if (c.guarantee && c.guarantee.expiryDate >= now) {
      active = active.add(c.guarantee.amount);
      activeCount += 1;
    } else if (!outcome && c.contractDetails) {
      pending = pending.add(c.contractDetails.guaranteeAmount);
    }
  }

  return {
    company: {
      id: company.id,
      name: company.name,
      crNumber: company.crNumber,
      sector: company.sector,
      city: company.city,
      createdAt: company.createdAt.toISOString(),
    },
    cases: cases.map((c) => ({
      id: c.id,
      reference: c.reference,
      status: c.status,
      submittedAt: c.submittedAt?.toISOString() ?? null,
      decidedAt: c.decidedAt?.toISOString() ?? null,
      contractTitle: c.contractDetails?.contractTitle ?? null,
      beneficiary: c.contractDetails?.beneficiary ?? null,
      sector: c.contractDetails?.sector ?? null,
      contractValue: c.contractDetails?.contractValue.toFixed(2) ?? null,
      guaranteeType: c.contractDetails?.guaranteeType ?? null,
      guaranteeAmount: c.contractDetails?.guaranteeAmount.toFixed(2) ?? null,
      currency: c.contractDetails?.currency ?? "SAR",
      latestDecision: c.officerDecisions[0]?.decision ?? null,
      guaranteeReference: c.guarantee?.reference ?? null,
      guaranteeExpiryDate: c.guarantee?.expiryDate.toISOString().slice(0, 10) ?? null,
    })),
    totals: {
      totalCases: cases.length,
      approved,
      declined,
      inFlight,
      activeGuarantees: activeCount,
      activeGuaranteeExposure: active.toFixed(2),
      pendingGuaranteeExposure: pending.toFixed(2),
    },
  };
}

const CASE_INCLUDE = {
  contractDetails: {
    select: {
      contractTitle: true,
      beneficiary: true,
      sector: true,
      contractValue: true,
      guaranteeType: true,
      guaranteeAmount: true,
      currency: true,
    },
  },
  officerDecisions: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { decision: true },
  },
  guarantee: { select: { reference: true, amount: true, expiryDate: true } },
} satisfies Prisma.UnderwritingCaseInclude;

/** Full history for the bank-side company page. Bank staff only. */
export async function getCompanyHistory(
  userId: string,
  companyId: string,
): Promise<CompanyHistory | null> {
  const staff = await getBankUser(userId);
  if (!staff) return null;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  // Officers never see drafts — a case exists for the bank at submission.
  const cases = await prisma.underwritingCase.findMany({
    where: { companyId, status: { not: "DRAFT" } },
    include: CASE_INCLUDE,
    orderBy: { submittedAt: "desc" },
  });

  return buildHistory(company, cases);
}

/**
 * The same history scoped for a case's chat/memo context: every OTHER
 * submitted case of the case's company. Callers are already role-gated
 * (the review read succeeded), so no second gate here.
 */
export async function getCompanyHistoryForCase(
  companyId: string,
  excludeCaseId: string,
): Promise<CompanyHistory | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const cases = await prisma.underwritingCase.findMany({
    where: { companyId, status: { not: "DRAFT" }, id: { not: excludeCaseId } },
    include: CASE_INCLUDE,
    orderBy: { submittedAt: "desc" },
  });

  return buildHistory(company, cases);
}
