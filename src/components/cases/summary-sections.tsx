/**
 * Read-only case summary blocks. Shared by the wizard Review step and the
 * Case Details page so the two never drift apart. No hooks — safe in both
 * server and client trees.
 */
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  AUDITOR_TIER_OPTIONS,
  AWARD_METHOD_OPTIONS,
  beneficiaryTypeLabel,
  BILLING_CYCLE_OPTIONS,
  CONTRACTOR_CLASSIFICATION_OPTIONS,
  CONTRACTOR_ROLE_OPTIONS,
  DOCUMENT_STATUS_META,
  EQUIPMENT_PLAN_OPTIONS,
  FUNDING_SOURCE_OPTIONS,
  guaranteeTypeLabel,
  NITAQAT_OPTIONS,
  PROJECTS_COMPLETED_OPTIONS,
  STATEMENT_TYPE_LABELS,
  type Option,
} from "@/lib/case-constants";
import { formatDate, formatFileSize, formatMoney, formatPercentValue } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { DocumentView } from "@/lib/case-view";
import type {
  CaseQualitativeInput,
  CompanyInfoInput,
  ContractDetailsInput,
} from "@/lib/validation/case";

/** Enum value → its display label ("" and unknowns render as em-dash). */
function optionLabel(options: readonly Option[], value: string | undefined): string | undefined {
  if (!value) return undefined;
  return options.find((o) => o.value === value)?.label ?? value;
}

const yesNoLabel = (value: string | undefined) =>
  value === "YES" ? "Yes" : value === "NO" ? "No" : undefined;

/** "value — note" when a Yes answer carries its description. */
function yesWithNote(value: string | undefined, note: string | undefined): string | undefined {
  const base = yesNoLabel(value);
  if (!base) return undefined;
  return value === "YES" && note?.trim() ? `Yes — ${note.trim()}` : base;
}

function DetailItem({
  label,
  value,
  wide = false,
  numeric = false,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
  /** Money/percentages: fixed-width digits so amounts read as figures and
   *  line up against each other rather than drifting with the glyph widths. */
  numeric?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "@md:col-span-2")}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-words text-sm text-foreground",
          numeric && "font-medium tabular-nums",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

/** Two columns only when the card itself is wide enough (container query) —
 * these blocks render in columns of very different widths across pages. */
function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 @md:grid-cols-2">{children}</dl>
    </div>
  );
}

export function CompanySummary({ company }: { company: CompanyInfoInput }) {
  return (
    <DetailGrid>
      <DetailItem label="Company Name" value={company.name} />
      <DetailItem label="Commercial Registration" value={company.crNumber} />
      <DetailItem label="Sector" value={company.sector} />
      <DetailItem label="City" value={company.city} />
      <DetailItem label="Contact Person" value={company.contactPerson} />
      <DetailItem label="Email" value={company.contactEmail} />
      <DetailItem label="Phone Number" value={company.phone} />
    </DetailGrid>
  );
}

export function ContractSummary({ contract }: { contract: ContractDetailsInput }) {
  const percent = (v: string | undefined) => (v ? formatPercentValue(v) : undefined);
  return (
    <DetailGrid>
      <DetailItem label="Contract Title" value={contract.contractTitle} wide />
      <DetailItem label="Beneficiary" value={contract.beneficiary} />
      <DetailItem label="Beneficiary Type" value={beneficiaryTypeLabel(contract.beneficiaryType)} />
      <DetailItem label="Sector" value={contract.sector} />
      <DetailItem label="Project Location" value={contract.projectLocation} />
      <DetailItem
        label="Contractor Role"
        value={optionLabel(CONTRACTOR_ROLE_OPTIONS, contract.contractorRole)}
      />
      <DetailItem
        label="Award Method"
        value={optionLabel(AWARD_METHOD_OPTIONS, contract.awardMethod)}
      />
      {contract.contractorRole === "SUBCONTRACTOR" && (
        <>
          <DetailItem label="Main Contractor" value={contract.mainContractorName} />
          <DetailItem
            label="Back-to-Back Payment"
            value={yesNoLabel(contract.backToBackPayment)}
          />
        </>
      )}
      <DetailItem
        label="Prior Contracts With Beneficiary"
        value={contract.priorContractsWithBeneficiary?.toString()}
        numeric
      />
      <DetailItem
        label="Contract Value"
        value={formatMoney(contract.contractValue, contract.currency)}
        numeric
      />
      <DetailItem
        label="Requested Guarantee"
        value={
          contract.guaranteeAmount
            ? formatMoney(contract.guaranteeAmount, contract.currency)
            : undefined
        }
        numeric
      />
      <DetailItem label="Guarantee Type" value={guaranteeTypeLabel(contract.guaranteeType)} />
      <DetailItem
        label="Guarantee Ratio"
        value={formatPercentValue(contract.guaranteePercentage)}
        numeric
      />
      <DetailItem label="Required Bond %" value={percent(contract.requiredBondPct)} numeric />
      <DetailItem label="Bond Validity Until" value={formatDate(contract.bondValidityDate)} />
      <DetailItem label="On First Demand" value={yesNoLabel(contract.onFirstDemand)} />
      <DetailItem label="'Extend or Pay' Clause" value={yesNoLabel(contract.extendOrPay)} />
      <DetailItem label="Advance Payment" value={percent(contract.advancePaymentPct)} numeric />
      <DetailItem
        label="Billing Cycle"
        value={optionLabel(BILLING_CYCLE_OPTIONS, contract.billingCycle)}
      />
      <DetailItem label="Retention" value={percent(contract.retentionPct)} numeric />
      <DetailItem
        label="Payment Period"
        value={contract.paymentPeriodDays ? `${contract.paymentPeriodDays} days` : undefined}
      />
      <DetailItem
        label="Liquidated Damages"
        value={
          contract.ldRatePctPerWeek && contract.ldCapPct
            ? `${contract.ldRatePctPerWeek}% / week, capped at ${contract.ldCapPct}%`
            : undefined
        }
        numeric
      />
      <DetailItem
        label="Mobilization Period"
        value={contract.mobilizationWeeks ? `${contract.mobilizationWeeks} weeks` : undefined}
      />
      <DetailItem
        label="Expected Gross Margin"
        value={percent(contract.expectedGrossMarginPct)}
        numeric
      />
      <DetailItem
        label="Key Suppliers Identified"
        value={yesWithNote(contract.keySuppliersIdentified, contract.keySuppliersNote)}
      />
      <DetailItem label="Project Start" value={formatDate(contract.projectStartDate)} />
      <DetailItem label="Project End" value={formatDate(contract.projectEndDate)} />
      <DetailItem label="Payment Notes" value={contract.paymentNotes} wide />
      <DetailItem label="Contract Description" value={contract.contractDescription} wide />
      <DetailItem label="Additional Notes" value={contract.additionalNotes} wide />
    </DetailGrid>
  );
}

export function QualitativeSummary({ qualitative }: { qualitative: CaseQualitativeInput }) {
  return (
    <DetailGrid>
      <DetailItem label="CR Issued" value={formatDate(qualitative.crIssueDate)} />
      <DetailItem
        label="Classification"
        value={optionLabel(CONTRACTOR_CLASSIFICATION_OPTIONS, qualitative.contractorClassification)}
      />
      <DetailItem label="Registered Activities" value={qualitative.crActivities} wide />
      <DetailItem label="General Manager" value={qualitative.gmName} />
      <DetailItem
        label="GM Experience"
        value={`${qualitative.gmExperienceYears} years`}
        numeric
      />
      <DetailItem
        label="Part of a Group"
        value={yesWithNote(qualitative.partOfGroup, qualitative.groupName)}
      />
      <DetailItem
        label="Ownership Change (2y)"
        value={yesWithNote(qualitative.ownershipChanged, qualitative.ownershipChangeNote)}
      />
      <DetailItem
        label="Nitaqat Band"
        value={optionLabel(NITAQAT_OPTIONS, qualitative.nitaqatBand)}
      />
      <DetailItem
        label="Ongoing Litigation"
        value={yesWithNote(qualitative.ongoingLitigation, qualitative.litigationNote)}
      />
      <DetailItem
        label="Projects Completed"
        value={optionLabel(PROJECTS_COMPLETED_OPTIONS, qualitative.projectsCompletedBand)}
      />
      <DetailItem
        label="Largest Completed Project"
        value={formatMoney(qualitative.largestProjectValue, "SAR")}
        numeric
      />
      <DetailItem
        label="Project Terminations / Penalties"
        value={yesWithNote(qualitative.hadProjectIssues, qualitative.projectIssuesNote)}
      />
      <DetailItem
        label="Guarantee Ever Called"
        value={yesWithNote(qualitative.guaranteeCalled, qualitative.guaranteeCalledNote)}
      />
      <DetailItem
        label="Same-Type Experience"
        value={yesWithNote(qualitative.sameTypeExperience, qualitative.sameTypeExperienceNote)}
      />
      <DetailItem
        label="Running Projects"
        value={qualitative.runningProjectsCount?.toString()}
        numeric
      />
      <DetailItem
        label="Remaining Backlog"
        value={formatMoney(qualitative.backlogValue, "SAR")}
        numeric
      />
      <DetailItem
        label="Outstanding Guarantees (All Banks)"
        value={formatMoney(qualitative.outstandingGuarantees, "SAR")}
        numeric
      />
      <DetailItem
        label="Equipment"
        value={optionLabel(EQUIPMENT_PLAN_OPTIONS, qualitative.equipmentPlan)}
      />
      <DetailItem label="Heavy Hiring Needed" value={yesNoLabel(qualitative.heavyHiringNeeded)} />
      <DetailItem label="Main Bank" value={qualitative.mainBank} />
      <DetailItem
        label="Conduct Incidents"
        value={yesWithNote(qualitative.conductIncidents, qualitative.conductIncidentsNote)}
      />
      <DetailItem
        label="Auditor"
        value={
          qualitative.auditorTier === "UNAUDITED"
            ? "Not audited"
            : [
                optionLabel(AUDITOR_TIER_OPTIONS, qualitative.auditorTier),
                qualitative.auditorName?.trim(),
              ]
                .filter(Boolean)
                .join(" — ")
        }
      />
      <DetailItem
        label="Funding Until First Payment"
        value={optionLabel(FUNDING_SOURCE_OPTIONS, qualitative.fundingSource)}
      />
    </DetailGrid>
  );
}

export function DocumentRow({
  document,
  children,
}: {
  document: DocumentView;
  children?: React.ReactNode;
}) {
  // Freshly uploaded wizard entries may predate a status — read as Uploaded.
  const status =
    DOCUMENT_STATUS_META[document.processingStatus] ?? DOCUMENT_STATUS_META.UPLOADED;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <FileText className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {document.fiscalYear ? `FY ${document.fiscalYear} — ` : ""}
          {document.fileName}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(document.fileSize)}
          {document.docType === "CONTRACT"
            ? " · Contract document"
            : document.statementType
              ? ` · ${STATEMENT_TYPE_LABELS[document.statementType]}`
              : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge variant="outline" className={cn("font-medium", status.className)}>
          {status.label}
        </Badge>
        {children}
      </div>
    </div>
  );
}

export function DocumentsSummary({
  documents,
  withDownload = false,
}: {
  documents: DocumentView[];
  withDownload?: boolean;
}) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No financial statements uploaded.</p>;
  }
  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <DocumentRow key={doc.id} document={doc}>
          {withDownload && (
            <a
              href={`/api/documents/${doc.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              View
            </a>
          )}
        </DocumentRow>
      ))}
    </div>
  );
}
