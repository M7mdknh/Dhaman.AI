/**
 * Read-only case summary blocks. Shared by the wizard Review step and the
 * Case Details page so the two never drift apart. No hooks — safe in both
 * server and client trees.
 */
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { beneficiaryTypeLabel, guaranteeTypeLabel } from "@/lib/case-constants";
import { formatDate, formatFileSize, formatMoney } from "@/lib/format";

import type { DocumentView } from "@/lib/case-view";
import type { CompanyInfoInput, ContractDetailsInput } from "@/lib/validation/case";

function DetailItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>;
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
  return (
    <DetailGrid>
      <DetailItem label="Contract Title" value={contract.contractTitle} wide />
      <DetailItem label="Beneficiary" value={contract.beneficiary} />
      <DetailItem label="Beneficiary Type" value={beneficiaryTypeLabel(contract.beneficiaryType)} />
      <DetailItem label="Sector" value={contract.sector} />
      <DetailItem label="Project Location" value={contract.projectLocation} />
      <DetailItem
        label="Contract Value"
        value={formatMoney(contract.contractValue, contract.currency)}
      />
      <DetailItem
        label="Requested Guarantee"
        value={formatMoney(contract.guaranteeAmount, contract.currency)}
      />
      <DetailItem label="Guarantee Type" value={guaranteeTypeLabel(contract.guaranteeType)} />
      <DetailItem
        label="Guarantee Percentage"
        value={contract.guaranteePercentage ? `${contract.guaranteePercentage}%` : null}
      />
      <DetailItem label="Project Start" value={formatDate(contract.projectStartDate)} />
      <DetailItem label="Project End" value={formatDate(contract.projectEndDate)} />
      <DetailItem label="Expected Payment Terms" value={contract.expectedPaymentTerms} wide />
      <DetailItem label="Contract Description" value={contract.contractDescription} wide />
      <DetailItem label="Additional Notes" value={contract.additionalNotes} wide />
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
        <p className="text-xs text-muted-foreground">{formatFileSize(document.fileSize)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge variant="outline" className="gap-1">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
          Uploaded
        </Badge>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Pending Analysis
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
