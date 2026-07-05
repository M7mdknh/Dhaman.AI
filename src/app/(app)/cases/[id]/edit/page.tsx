import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StatusBadge } from "@/components/cases/status-badge";
import { CaseWizard } from "@/components/cases/wizard/case-wizard";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { toCompanyInput, toContractInput, toDocumentView } from "@/lib/case-view";
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

  const contract = underwritingCase.contractDetails
    ? toContractInput(underwritingCase.contractDetails)
    : null;
  const documents = underwritingCase.documents
    .filter((d) => d.docType === "FINANCIAL_STATEMENT")
    .map(toDocumentView);

  const requestedStep = Math.min(Math.max(Number(step) || 1, 1), 4);
  const initialStep = contract ? requestedStep : Math.min(requestedStep, 2);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
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
        contract={contract}
        documents={documents}
      />
    </div>
  );
}
