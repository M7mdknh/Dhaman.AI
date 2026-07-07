/**
 * Domain vocabulary shared by forms, validation, and display.
 * Values mirror the Prisma enums (string literals so this file is safe to
 * import from client components without pulling in the generated client).
 */
import type { BeneficiaryType, CaseStatus, GuaranteeType } from "@/generated/prisma/enums";

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export const GUARANTEE_TYPE_OPTIONS: Option<GuaranteeType>[] = [
  { value: "BID_BOND", label: "Bid Bond" },
  { value: "PERFORMANCE", label: "Performance Bond" },
  { value: "ADVANCE_PAYMENT", label: "Advance Payment Guarantee" },
  { value: "RETENTION", label: "Retention Guarantee" },
];

export const BENEFICIARY_TYPE_OPTIONS: Option<BeneficiaryType>[] = [
  { value: "GOVERNMENT", label: "Government" },
  { value: "PRIVATE", label: "Private" },
];

export const SECTOR_OPTIONS = [
  "General Construction",
  "Infrastructure",
  "Oil & Gas",
  "Utilities & Energy",
  "Real Estate Development",
  "Building Materials",
  "Transportation & Logistics",
  "Healthcare",
  "Education",
  "Information Technology",
  "Manufacturing",
  "Other",
] as const;

export const CURRENCY_OPTIONS = ["SAR", "USD", "EUR"] as const;

/** Fiscal years accepted for audited IFRS statement uploads. */
export const STATEMENT_YEARS = [2025, 2024, 2023] as const;

export const MAX_STATEMENT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per PDF

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PROCESSING: "Processing",
  PROCESSING_FAILED: "Processing Failed",
  PARSING: "Processing",
  ANALYSIS_READY: "Analysis Ready",
  UNDER_REVIEW: "Under Review",
  INFO_REQUESTED: "Info Requested",
  APPROVED: "Approved",
  DECLINED: "Declined",
  ISSUED: "Issued",
};

export function guaranteeTypeLabel(value: GuaranteeType): string {
  return GUARANTEE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function beneficiaryTypeLabel(value: BeneficiaryType): string {
  return BENEFICIARY_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
