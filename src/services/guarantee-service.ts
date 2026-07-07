/**
 * Letter of Guarantee issuance (Sprint 5). One guarantee per case, minted
 * only from an APPROVED case by bank staff. The PDF is rendered on demand
 * from the guarantee row (`lib/pdf/guarantee-pdf.ts`) — deterministic,
 * nothing stored on disk, downloads always through an authenticated route.
 */
import { guaranteeTypeLabel } from "@/lib/case-constants";
import { renderGuaranteePdf } from "@/lib/pdf/guarantee-pdf";
import { prisma } from "@/lib/prisma";
import { canIssueGuarantee } from "@/lib/review";
import { recordAudit } from "@/services/audit-service";
import { getOfficerUser } from "@/services/officer-case-service";

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

/** Mints `LG-YYYY-NNNNNN` from the row's internal `seq` (same race-free pattern as case references). */
export function formatGuaranteeReference(seq: number, issueDate: Date): string {
  return `LG-${issueDate.getUTCFullYear()}-${String(seq).padStart(6, "0")}`;
}

/**
 * Issues the Letter of Guarantee for an APPROVED case and moves it to
 * ISSUED. Guarantee particulars are copied from the contract at issue time —
 * the instrument must stay exactly as issued even if case data changes.
 */
export async function issueGuarantee(
  officerUserId: string,
  caseId: string,
): Promise<ActionResult<{ reference: string }>> {
  const officer = await getOfficerUser(officerUserId);
  if (!officer) return { ok: false, error: "Only bank staff can issue guarantees." };

  const underwritingCase = await prisma.underwritingCase.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      reference: true,
      contractDetails: true,
      guarantee: { select: { id: true } },
    },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };
  if (underwritingCase.guarantee) {
    return { ok: false, error: "A guarantee has already been issued for this case." };
  }
  if (!canIssueGuarantee(underwritingCase.status)) {
    return { ok: false, error: "Only approved cases can issue a Letter of Guarantee." };
  }
  const contract = underwritingCase.contractDetails;
  if (!contract) return { ok: false, error: "Contract details are missing." };

  const issueDate = new Date();
  const guarantee = await prisma.$transaction(async (tx) => {
    const draft = await tx.guarantee.create({
      data: {
        caseId,
        issuedById: officerUserId,
        reference: `TMP-${crypto.randomUUID()}`,
        amount: contract.guaranteeAmount,
        currency: contract.currency,
        beneficiary: contract.beneficiary,
        issueDate,
        // The guarantee follows the guaranteed contract's end date.
        expiryDate: contract.projectEndDate,
      },
    });
    const issued = await tx.guarantee.update({
      where: { id: draft.id },
      data: { reference: formatGuaranteeReference(draft.seq, issueDate) },
    });
    await tx.underwritingCase.update({ where: { id: caseId }, data: { status: "ISSUED" } });
    return issued;
  });

  await recordAudit({
    action: "guarantee.issued",
    actorId: officerUserId,
    caseId,
    detail: {
      reference: guarantee.reference,
      caseReference: underwritingCase.reference,
      amount: guarantee.amount.toString(),
      currency: guarantee.currency,
      expiryDate: guarantee.expiryDate.toISOString().slice(0, 10),
    },
  });
  return { ok: true, data: { reference: guarantee.reference } };
}

/**
 * Renders the LG PDF for download. Allowed for bank staff and for the
 * contractor company that owns the case — both audited.
 */
export async function getGuaranteePdf(
  userId: string,
  caseId: string,
): Promise<ActionResult<{ fileName: string; bytes: Uint8Array }>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, companyId: true },
  });
  if (!user) return { ok: false, error: "Not authorized." };

  const isBankStaff = user.role === "RISK_OFFICER" || user.role === "ADMIN";
  const guarantee = await prisma.guarantee.findFirst({
    where: {
      case: {
        id: caseId,
        // Contractors can only reach their own company's guarantee.
        ...(isBankStaff ? {} : { companyId: user.companyId ?? "__none__" }),
      },
    },
    include: {
      issuedBy: { select: { fullName: true } },
      case: {
        select: {
          reference: true,
          company: { select: { name: true, crNumber: true } },
          contractDetails: { select: { contractTitle: true, guaranteeType: true } },
        },
      },
    },
  });
  if (!guarantee) return { ok: false, error: "Guarantee not found." };

  const bytes = await renderGuaranteePdf({
    reference: guarantee.reference,
    caseReference: guarantee.case.reference,
    companyName: guarantee.case.company.name,
    crNumber: guarantee.case.company.crNumber,
    beneficiary: guarantee.beneficiary,
    guaranteeTypeLabel: guarantee.case.contractDetails
      ? guaranteeTypeLabel(guarantee.case.contractDetails.guaranteeType)
      : "Letter of Guarantee",
    amount: guarantee.amount.toString(),
    currency: guarantee.currency,
    contractTitle: guarantee.case.contractDetails?.contractTitle ?? "—",
    issueDate: guarantee.issueDate,
    expiryDate: guarantee.expiryDate,
    officerName: guarantee.issuedBy.fullName,
  });

  await recordAudit({
    action: "guarantee.pdf_downloaded",
    actorId: userId,
    caseId,
    detail: { reference: guarantee.reference },
  });
  return { ok: true, data: { fileName: `${guarantee.reference}.pdf`, bytes } };
}
