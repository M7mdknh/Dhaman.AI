/**
 * Domain vocabulary shared by forms, validation, and display.
 * Values mirror the Prisma enums (string literals so this file is safe to
 * import from client components without pulling in the generated client).
 */
import type {
  AuditorTier,
  AwardMethod,
  BeneficiaryType,
  BillingCycle,
  CaseStatus,
  ContractorRole,
  DocumentProcessingStatus,
  FundingSource,
  GuaranteeType,
  NitaqatBand,
  ProjectsCompletedBand,
  StatementType,
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
  // Financial companies (banks, fintech/BNPL — e.g. Tamara) can also be
  // Daman applicants, not only construction/industrial contractors.
  "Banking & Financial Services",
  "Fintech & Digital Payments (BNPL)",
  "Insurance",
  "Other",
] as const;

export const CURRENCY_OPTIONS = ["SAR", "USD", "EUR"] as const;

// ---------------------------------------------------------------------------
// KYC questionnaire vocabulary (wizard Step 2 — CaseQualitative).
// Every banded option maps to a deterministic sub-score in
// lib/finance/thresholds.ts QUALITATIVE — no band exists without a score.
// ---------------------------------------------------------------------------

export const YES_NO_OPTIONS = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
] as const satisfies readonly Option[];

export const NITAQAT_OPTIONS: Option<NitaqatBand>[] = [
  { value: "PLATINUM", label: "Platinum" },
  { value: "GREEN", label: "Green" },
  { value: "YELLOW", label: "Yellow" },
  { value: "RED", label: "Red" },
];

export const PROJECTS_COMPLETED_OPTIONS: Option<ProjectsCompletedBand>[] = [
  { value: "UNDER_5", label: "Fewer than 5" },
  { value: "FROM_5_TO_10", label: "5 – 10" },
  { value: "FROM_10_TO_25", label: "10 – 25" },
  { value: "OVER_25", label: "More than 25" },
];

export const AUDITOR_TIER_OPTIONS: Option<AuditorTier>[] = [
  { value: "BIG_FOUR", label: "Big-4 firm (PwC, EY, KPMG, Deloitte)" },
  { value: "ACCREDITED_LOCAL", label: "SOCPA-accredited local firm" },
  { value: "OTHER_FIRM", label: "Other audit firm" },
  { value: "UNAUDITED", label: "Not audited" },
];

export const FUNDING_SOURCE_OPTIONS: Option<FundingSource>[] = [
  { value: "OWN_CASH", label: "Own cash" },
  { value: "THIS_BANK", label: "Financing from this bank" },
  { value: "OTHER_BANK", label: "Financing from another bank" },
  { value: "SUPPLIER_CREDIT", label: "Supplier credit" },
];

/** Main operating banks offered in the KYC conduct section. */
export const SAUDI_BANK_OPTIONS = [
  "Alinma Bank",
  "Al Rajhi Bank",
  "Saudi National Bank (SNB)",
  "Riyad Bank",
  "SAB",
  "Banque Saudi Fransi",
  "Arab National Bank",
  "Bank Albilad",
  "Bank AlJazira",
  "The Saudi Investment Bank",
  "Gulf International Bank",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Contract structure vocabulary (wizard Step 3 additions).
// ---------------------------------------------------------------------------

export const CONTRACTOR_ROLE_OPTIONS: Option<ContractorRole>[] = [
  { value: "MAIN_CONTRACTOR", label: "Main contractor" },
  { value: "SUBCONTRACTOR", label: "Subcontractor" },
];

export const AWARD_METHOD_OPTIONS: Option<AwardMethod>[] = [
  { value: "PUBLIC_TENDER", label: "Public tender" },
  { value: "LIMITED_TENDER", label: "Limited tender" },
  { value: "DIRECT_AWARD", label: "Direct award" },
];

export const BILLING_CYCLE_OPTIONS: Option<BillingCycle>[] = [
  { value: "MONTHLY", label: "Monthly progress billing" },
  { value: "MILESTONE", label: "Milestone-based" },
  { value: "OTHER", label: "Other" },
];

/** Days from invoice certification to payment. */
export const PAYMENT_PERIOD_OPTIONS: Option[] = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "120", label: "120+ days" },
];

export const STATEMENT_TYPE_OPTIONS: Option<StatementType>[] = [
  { value: "AUDITED", label: "Audited" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "MANAGEMENT", label: "Management accounts" },
];

export const STATEMENT_TYPE_LABELS: Record<StatementType, string> = {
  AUDITED: "Audited",
  REVIEWED: "Reviewed",
  MANAGEMENT: "Management accounts",
};

/**
 * Fiscal years accepted for audited IFRS statement uploads. Computed off the
 * current date (never hand-maintained) so the accepted range advances every
 * year with no code change. The wizard shows only the latest year by
 * default; "+ Add Year" reveals earlier years up to the historical cap.
 */
const CURRENT_CALENDAR_YEAR = new Date().getFullYear();
export const LATEST_STATEMENT_YEAR = CURRENT_CALENDAR_YEAR - 1;
export const MAX_STATEMENT_HISTORY_YEARS = 6;
export const EARLIEST_STATEMENT_YEAR =
  LATEST_STATEMENT_YEAR - MAX_STATEMENT_HISTORY_YEARS + 1;

export function isAcceptedStatementYear(year: number): boolean {
  return (
    Number.isInteger(year) && year <= LATEST_STATEMENT_YEAR && year >= EARLIEST_STATEMENT_YEAR
  );
}

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
  RM_REVIEWED: "Sent to Risk Officer",
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
