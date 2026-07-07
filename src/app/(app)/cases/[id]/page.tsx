import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BarChart3, PencilLine } from "lucide-react";

import { CaseTimeline, type TimelineEntry } from "@/components/cases/case-timeline";
import { DecisionStatusCard } from "@/components/cases/decision-status";
import { DeleteDraftDialog } from "@/components/cases/delete-draft-dialog";
import { StatusBadge } from "@/components/cases/status-badge";
import {
  CompanySummary,
  ContractSummary,
  DocumentsSummary,
} from "@/components/cases/summary-sections";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExtractedFigures } from "@/components/cases/extracted-figures";
import { getSession } from "@/lib/auth/session";
import {
  toCompanyInput,
  toContractInput,
  toDocumentView,
  toStatementFigures,
} from "@/lib/case-view";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getOwnedCase, type CaseWithRelations } from "@/services/case-service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Underwriting Case" };

/**
 * The contractor's lifecycle timeline. Bank-internal steps (the AI memo)
 * are deliberately absent — the applicant sees business events only.
 */
function buildTimeline(underwritingCase: CaseWithRelations): TimelineEntry[] {
  const submitted = underwritingCase.submittedAt;
  const analysisReady =
    underwritingCase.financialStatements.length > 0 &&
    underwritingCase.status !== "DRAFT";
  const terminal =
    underwritingCase.officerDecisions.find((d) => d.decision !== "REQUEST_INFO") ?? null;
  const decisionLabel =
    terminal === null
      ? "Decision"
      : terminal.decision === "REJECT"
        ? "Decision — Declined"
        : "Decision — Approved";
  return [
    {
      label: "Created",
      timestamp: formatDateTime(underwritingCase.createdAt),
      state: "complete",
    },
    {
      label: "Draft Saved",
      timestamp: formatDateTime(underwritingCase.updatedAt),
      state: "complete",
    },
    {
      label: "Submitted",
      timestamp: submitted ? formatDateTime(submitted) : undefined,
      state: submitted ? "complete" : "upcoming",
    },
    { label: "Financial Analysis", state: analysisReady ? "complete" : "upcoming" },
    {
      label: "Officer Review",
      timestamp: underwritingCase.reviewStartedAt
        ? formatDateTime(underwritingCase.reviewStartedAt)
        : undefined,
      state: underwritingCase.reviewStartedAt ? "complete" : "upcoming",
    },
    {
      label: decisionLabel,
      timestamp: terminal ? formatDateTime(terminal.createdAt) : undefined,
      state: terminal ? "complete" : "upcoming",
    },
    {
      label: "Letter of Guarantee",
      timestamp: underwritingCase.guarantee
        ? formatDate(underwritingCase.guarantee.issueDate)
        : undefined,
      state: underwritingCase.guarantee ? "complete" : "upcoming",
    },
  ];
}

export default async function CaseDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const underwritingCase = await getOwnedCase(session.userId, id);
  if (!underwritingCase) notFound();

  const isDraft = underwritingCase.status === "DRAFT";
  const contract = underwritingCase.contractDetails
    ? toContractInput(underwritingCase.contractDetails)
    : null;
  const documents = underwritingCase.documents
    .filter((d) => d.docType === "FINANCIAL_STATEMENT")
    .map(toDocumentView);
  const extractedStatements = underwritingCase.financialStatements.map(toStatementFigures);
  const extractionWarnings = underwritingCase.documents.flatMap((d) => {
    const validation = d.extraction?.validation as
      | { warnings?: { message: string }[] }
      | null
      | undefined;
    return (validation?.warnings ?? []).map((w) => `${d.fileName}: ${w.message}`);
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {underwritingCase.reference}
            </h1>
            <StatusBadge status={underwritingCase.status} />
          </div>
          <div className="flex items-center gap-2">
            {extractedStatements.length > 0 && !isDraft && (
              <Link href={`/cases/${id}/analysis`} className={cn(buttonVariants())}>
                <BarChart3 className="size-4" aria-hidden />
                Financial Analysis
              </Link>
            )}
            {isDraft && (
              <>
                <Link
                  href={`/cases/${id}/edit`}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  <PencilLine className="size-4" aria-hidden />
                  Continue Editing
                </Link>
                <DeleteDraftDialog caseId={id} reference={underwritingCase.reference} />
              </>
            )}
          </div>
        </div>
        {contract && (
          <p className="mt-1 text-sm text-muted-foreground">{contract.contractTitle}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Company Information</CardTitle>
            </CardHeader>
            <CardContent>
              <CompanySummary company={toCompanyInput(underwritingCase.company)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Contract Details</CardTitle>
            </CardHeader>
            <CardContent>
              {contract ? (
                <ContractSummary contract={contract} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Contract details have not been completed yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Financial Statements</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentsSummary documents={documents} withDownload />
            </CardContent>
          </Card>

          {extractedStatements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Extracted Financial Data</CardTitle>
              </CardHeader>
              <CardContent>
                <ExtractedFigures
                  statements={extractedStatements}
                  warnings={extractionWarnings}
                />
              </CardContent>
            </Card>
          )}

          <DecisionStatusCard
            caseId={id}
            status={underwritingCase.status}
            decisions={underwritingCase.officerDecisions}
            guarantee={underwritingCase.guarantee}
          />
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <CaseTimeline entries={buildTimeline(underwritingCase)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
