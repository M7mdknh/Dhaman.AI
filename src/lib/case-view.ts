/**
 * Serializable view/input shapes for the case workspace.
 *
 * Prisma rows carry Decimal/Date instances which cannot cross the
 * server → client component boundary; these mappers flatten them to the
 * exact string shapes the wizard forms and summary components consume
 * (identical to the zod input types, so saved data round-trips).
 */
import type {
  CaseQualitativeInput,
  CompanyInfoInput,
  ContractDetailsInput,
} from "@/lib/validation/case";
import type {
  CaseQualitative,
  Company,
  ContractDetails,
  Document,
  FinancialStatement,
} from "@/generated/prisma/client";
import type { CaseStatus, DocumentType, StatementType } from "@/generated/prisma/enums";
import type { CaseListItem } from "@/services/case-service";

export interface DocumentView {
  id: string;
  fileName: string;
  fileSize: number;
  fiscalYear: number | null;
  docType: DocumentType;
  statementType: StatementType | null;
  processingStatus: Document["processingStatus"];
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

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const yesNoView = (v: boolean | null) => (v === null ? "" : v ? "YES" : "NO") as "YES" | "NO" | "";

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
    guaranteePercentage: details.guaranteePercentage.toString(),
    projectStartDate: isoDate(details.projectStartDate),
    projectEndDate: isoDate(details.projectEndDate),
    projectLocation: details.projectLocation,
    additionalNotes: details.additionalNotes ?? "",
    // Structured additions — legacy rows (pre-KYC cases) render as blanks,
    // which the zod schema then requires before the draft can move on.
    contractorRole: (details.contractorRole ?? "") as ContractDetailsInput["contractorRole"],
    mainContractorName: details.mainContractorName ?? "",
    backToBackPayment: yesNoView(details.backToBackPayment),
    awardMethod: (details.awardMethod ?? "") as ContractDetailsInput["awardMethod"],
    priorContractsWithBeneficiary: details.priorContractsWithBeneficiary?.toString() ?? "",
    advancePaymentPct: details.advancePaymentPct?.toString() ?? "",
    billingCycle: (details.billingCycle ?? "") as ContractDetailsInput["billingCycle"],
    retentionPct: details.retentionPct?.toString() ?? "",
    paymentPeriodDays: (details.paymentPeriodDays?.toString() ??
      "") as ContractDetailsInput["paymentPeriodDays"],
    paymentNotes: details.paymentNotes ?? details.expectedPaymentTerms ?? "",
    requiredBondPct: details.requiredBondPct?.toString() ?? "",
    bondValidityDate: isoDate(details.bondValidityDate),
    onFirstDemand: yesNoView(details.onFirstDemand) as ContractDetailsInput["onFirstDemand"],
    extendOrPay: yesNoView(details.extendOrPay) as ContractDetailsInput["extendOrPay"],
    ldRatePctPerWeek: details.ldRatePctPerWeek?.toString() ?? "",
    ldCapPct: details.ldCapPct?.toString() ?? "",
    mobilizationWeeks: details.mobilizationWeeks?.toString() ?? "",
    keySuppliersIdentified: yesNoView(
      details.keySuppliersIdentified,
    ) as ContractDetailsInput["keySuppliersIdentified"],
    keySuppliersNote: details.keySuppliersNote ?? "",
    expectedGrossMarginPct: details.expectedGrossMarginPct?.toString() ?? "",
  };
}

export function toQualitativeInput(row: CaseQualitative | null): CaseQualitativeInput | null {
  if (!row) return null;
  return {
    crIssueDate: isoDate(row.crIssueDate),
    partOfGroup: yesNoView(row.partOfGroup) as "YES" | "NO",
    groupName: row.groupName ?? "",
    ownershipChanged: yesNoView(row.ownershipChanged) as "YES" | "NO",
    ownershipChangeNote: row.ownershipChangeNote ?? "",
    nitaqatBand: row.nitaqatBand,
    ongoingLitigation: yesNoView(row.ongoingLitigation) as "YES" | "NO",
    litigationNote: row.litigationNote ?? "",
    projectsCompletedBand: row.projectsCompletedBand,
    hadProjectIssues: yesNoView(row.hadProjectIssues) as "YES" | "NO",
    projectIssuesNote: row.projectIssuesNote ?? "",
    guaranteeCalled: yesNoView(row.guaranteeCalled) as "YES" | "NO",
    guaranteeCalledNote: row.guaranteeCalledNote ?? "",
    sameTypeExperience: yesNoView(row.sameTypeExperience) as "YES" | "NO",
    sameTypeExperienceNote: row.sameTypeExperienceNote ?? "",
    runningProjectsCount: row.runningProjectsCount.toString(),
    backlogValue: row.backlogValue.toString(),
    outstandingGuarantees: row.outstandingGuarantees.toString(),
    heavyHiringNeeded: yesNoView(row.heavyHiringNeeded) as "YES" | "NO",
    mainBank: row.mainBank,
    conductIncidents: yesNoView(row.conductIncidents) as "YES" | "NO",
    conductIncidentsNote: row.conductIncidentsNote ?? "",
    auditorTier: row.auditorTier,
    auditorName: row.auditorName ?? "",
    fundingSource: row.fundingSource,
  };
}

export function toDocumentView(document: Document): DocumentView {
  return {
    id: document.id,
    fileName: document.fileName,
    fileSize: document.fileSize,
    fiscalYear: document.fiscalYear,
    docType: document.docType,
    statementType: document.statementType,
    processingStatus: document.processingStatus,
    createdAt: document.createdAt.toISOString(),
  };
}

/** Figure keys shown in the extracted-data review table, in display order. */
export const EXTRACTED_FIGURE_LABELS: [keyof FinancialStatement & string, string][] = [
  ["revenue", "Revenue"],
  ["grossProfit", "Gross Profit"],
  ["operatingIncome", "Operating Income"],
  ["netIncome", "Net Income"],
  ["cash", "Cash & Equivalents"],
  ["receivables", "Trade Receivables"],
  ["inventory", "Inventories"],
  ["currentAssets", "Total Current Assets"],
  ["totalAssets", "Total Assets"],
  ["currentLiabilities", "Total Current Liabilities"],
  ["totalLiabilities", "Total Liabilities"],
  ["totalEquity", "Total Equity"],
  ["operatingCashFlow", "Operating Cash Flow"],
  ["investingCashFlow", "Investing Cash Flow"],
  ["financingCashFlow", "Financing Cash Flow"],
  ["capex", "Capital Expenditure"],
];

export interface StatementFiguresView {
  fiscalYear: number;
  currency: string;
  /** Canonical key → decimal string (null = not extracted). */
  figures: Record<string, string | null>;
}

export function toStatementFigures(row: FinancialStatement): StatementFiguresView {
  const figures: Record<string, string | null> = {};
  for (const [key] of EXTRACTED_FIGURE_LABELS) {
    const value = row[key as keyof FinancialStatement];
    figures[key] = value === null || value === undefined ? null : String(value);
  }
  return { fiscalYear: row.fiscalYear, currency: row.currency, figures };
}
