/**
 * Serializable view/input shapes for the case workspace.
 *
 * Prisma rows carry Decimal/Date instances which cannot cross the
 * server → client component boundary; these mappers flatten them to the
 * exact string shapes the wizard forms and summary components consume
 * (identical to the zod input types, so saved data round-trips).
 */
import type { CompanyInfoInput, ContractDetailsInput } from "@/lib/validation/case";
import type { Company, ContractDetails, Document } from "@/generated/prisma/client";
import type { CaseStatus } from "@/generated/prisma/enums";
import type { CaseListItem } from "@/services/case-service";

export interface DocumentView {
  id: string;
  fileName: string;
  fileSize: number;
  fiscalYear: number | null;
  createdAt: string; // ISO
}

/** Flat, serializable row for the dashboard cases table. */
export interface CaseRowView {
  id: string;
  reference: string;
  status: CaseStatus;
  contractTitle: string | null;
  beneficiary: string | null;
  guaranteeAmount: string | null;
  currency: string;
  updatedAt: string; // ISO
}

export function toCaseRow(item: CaseListItem): CaseRowView {
  return {
    id: item.id,
    reference: item.reference,
    status: item.status,
    contractTitle: item.contractDetails?.contractTitle ?? null,
    beneficiary: item.contractDetails?.beneficiary ?? null,
    guaranteeAmount: item.contractDetails?.guaranteeAmount.toString() ?? null,
    currency: item.contractDetails?.currency ?? "SAR",
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toCompanyInput(company: Company | null): CompanyInfoInput {
  return {
    name: company?.name ?? "",
    crNumber: company?.crNumber ?? "",
    sector: (company?.sector ?? "") as CompanyInfoInput["sector"],
    city: company?.city ?? "",
    contactPerson: company?.contactPerson ?? "",
    contactEmail: company?.contactEmail ?? "",
    phone: company?.phone ?? "",
  };
}

export function toContractInput(details: ContractDetails): ContractDetailsInput {
  return {
    beneficiary: details.beneficiary,
    beneficiaryType: details.beneficiaryType,
    contractTitle: details.contractTitle,
    contractDescription: details.contractDescription ?? "",
    sector: details.sector as ContractDetailsInput["sector"],
    contractValue: details.contractValue.toString(),
    currency: details.currency as ContractDetailsInput["currency"],
    guaranteeAmount: details.guaranteeAmount.toString(),
    guaranteeType: details.guaranteeType,
    guaranteePercentage: details.guaranteePercentage?.toString() ?? "",
    projectStartDate: details.projectStartDate.toISOString().slice(0, 10),
    projectEndDate: details.projectEndDate.toISOString().slice(0, 10),
    projectLocation: details.projectLocation,
    expectedPaymentTerms: details.expectedPaymentTerms ?? "",
    additionalNotes: details.additionalNotes ?? "",
  };
}

export function toDocumentView(document: Document): DocumentView {
  return {
    id: document.id,
    fileName: document.fileName,
    fileSize: document.fileSize,
    fiscalYear: document.fiscalYear,
    createdAt: document.createdAt.toISOString(),
  };
}
