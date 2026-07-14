/**
 * Domain vocabulary shared by forms, validation, and display.
 * Values mirror the Prisma enums (string literals so this file is safe to
 * import from client components without pulling in the generated client).
 */
import type {
  BeneficiaryType,
  CaseStatus,
  DocumentProcessingStatus,
  GuaranteeType,
} from "@/generated/prisma/enums";

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export const GUARANTEE_TYPE_OPTIONS: Option<GuaranteeType>[] = [
  { value: "BID_BOND", label: "Bid Bond" },
  { value: "PERFORMANCE", label: "Performance Bond" },
  { value: "ADVANCE_PAYMENT", label: "Advance Payment Guarantee" },
  { value: "RETENTION", label: "Retention Guarantee" },
  { value: "LETTER_OF_CREDIT", label: "Letter of Credit" },
];

/**
 * What the underwriting analysis emphasizes per product (framework §3).
 * Narrative guidance only — shown to applicants and passed to the AI memo
 * prompt so the explanation stresses the right angle. The deterministic
 * engines are product-agnostic and never read this.
 */
export const GUARANTEE_TYPE_FOCUS: Record<GuaranteeType, string> = {
  BID_BOND: "Basic solvency and seriousness of the bid — the lowest-risk instrument.",
  PERFORMANCE:
    "Execution capacity: working-capital adequacy and concentration of existing project obligations.",
  ADVANCE_PAYMENT:
    "Cash-flow discipline: whether the advance is deployed into the project rather than absorbed by other obligations.",
  RETENTION:
    "Completion quality: project handover history and exposure to warranty or defect-liability claims.",
  LETTER_OF_CREDIT:
    "Ability to fund the payment at maturity: liquidity, cash conversion cycle, and trade payables behavior.",
};

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

/**
 * MIME sniff for the pre-upload gate, shared by the uploader UI and the
 * server. Mobile pickers (Android in particular) often hand PDFs over with an
 * EMPTY or generic type, so the declared type alone must never reject a file
 * — the extension backs it up, and the server verifies the actual PDF bytes
 * once the content arrives.
 */
export function looksLikePdf(fileName: string, fileType: string): boolean {
  if (fileType === "application/pdf") return true;
  return (fileType === "" || fileType === "application/octet-stream") && /\.pdf$/i.test(fileName);
}

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PROCESSING: "Processing",
  PROCESSING_FAILED: "Processing Failed",
  PARSING: "Processing",
  ANALYSIS_READY: "Analysis Ready",
  RM_REVIEWED: "RM Reviewed",
  UNDER_REVIEW: "Under Review",
  INFO_REQUESTED: "Info Requested",
  APPROVED: "Approved",
  DECLINED: "Declined",
  ISSUED: "Issued",
};

/** Document extraction status → badge text + tone, shared by every document list. */
export const DOCUMENT_STATUS_META: Record<
  DocumentProcessingStatus,
  { label: string; className: string }
> = {
  UPLOADED: { label: "Uploaded", className: "border-border bg-muted text-muted-foreground" },
  QUEUED: { label: "Queued", className: "border-border bg-muted text-muted-foreground" },
  PROCESSING: { label: "Processing", className: "border-sky-200 bg-sky-50 text-sky-700" },
  COMPLETED: {
    label: "Extracted",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  FAILED: { label: "Failed", className: "border-red-200 bg-red-50 text-red-700" },
  // Express underwriting reads only the latest audited statement by design.
  SKIPPED: { label: "Not needed", className: "border-border bg-muted text-muted-foreground" },
};

export function guaranteeTypeLabel(value: GuaranteeType): string {
  return GUARANTEE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function beneficiaryTypeLabel(value: BeneficiaryType): string {
  return BENEFICIARY_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
