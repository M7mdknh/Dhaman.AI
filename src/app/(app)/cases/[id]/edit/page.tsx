import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StatusBadge } from "@/components/cases/status-badge";
import { CaseWizard } from "@/components/cases/wizard/case-wizard";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import {
  toCompanyInput,
  toContractInput,
  toDocumentView,
  toQualitativeInput,
} from "@/lib/case-view";
import { getOwnedCase } from "@/services/case-service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Edit Underwriting Case" };

export default async function EditCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [{ id }, { step }] = await Promise.all([params, searchParams]);
  const underwritingCase = await getOwnedCase(session.userId, id);
  if (!underwritingCase) notFound();
  // Business rule: only drafts are editable.
  if (underwritingCase.status !== "DRAFT") redirect(`/cases/${id}`);

  const qualitative = toQualitativeInput(underwritingCase.qualitative);
  const contract = underwritingCase.contractDetails
    ? toContractInput(underwritingCase.contractDetails)
    : null;
  // Statements AND the contract/award-letter document — the wizard splits
  // them by docType.
  const documents = underwritingCase.documents
    .filter((d) => d.docType === "FINANCIAL_STATEMENT" || d.docType === "CONTRACT")
    .map(toDocumentView);

  const requestedStep = Math.min(Math.max(Number(step) || 1, 1), 5);
  // Each step unlocks only when everything before it is saved.
  const maxOpenStep = !qualitative ? 2 : !contract ? 3 : 5;
  const initialStep = Math.min(requestedStep, maxOpenStep);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">
            {underwritingCase.reference}
          </h1>
          <StatusBadge status={underwritingCase.status} />
        </div>
        <Link
          href={`/cases/${id}`}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          Exit to case
        </Link>
      </div>
      <CaseWizard
        mode="edit"
        caseId={underwritingCase.id}
        initialStep={initialStep}
        company={toCompanyInput(underwritingCase.company)}
        qualitative={qualitative}
        contract={contract}
        documents={documents}
      />
    </div>
  );
}
