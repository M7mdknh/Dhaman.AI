import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";

import { CaseTimeline, type TimelineEntry } from "@/components/cases/case-timeline";
import { DecisionStatusCard } from "@/components/cases/decision-status";
import { DeleteDraftDialog } from "@/components/cases/delete-draft-dialog";
import { ProcessingDashboard } from "@/components/cases/processing-dashboard";
import { StatusBadge } from "@/components/cases/status-badge";
import {
  CompanySummary,
  ContractSummary,
  DocumentsSummary,
  QualitativeSummary,
} from "@/components/cases/summary-sections";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExtractedFigures } from "@/components/cases/extracted-figures";
import { getSession } from "@/lib/auth/session";
import {
  toCompanyInput,
  toContractInput,
  toDocumentView,
  toQualitativeInput,
  toStatementFigures,
} from "@/lib/case-view";
import { formatDate, formatDateTime } from "@/lib/format";
import { isProcessingActive } from "@/lib/processing";
import { cn } from "@/lib/utils";
import { getOwnedCase, type CaseWithRelations } from "@/services/case-service";
import { toDocumentSnapshots, toProcessingSnapshot } from "@/services/case-processing-service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Underwriting Case" };

/**
 * The contractor's lifecycle timeline. Bank-internal steps (the AI memo)
 * are deliberately absent — the applicant sees business events only.
 */
function buildTimeline(underwritingCase: CaseWithRelations): TimelineEntry[] {
  const submitted = underwritingCase.submittedAt;
  // Statement rows can exist yet fail integrity validation (PROCESSING_FAILED)
  // — the analysis step is only "complete" once the case actually reached
  // ANALYSIS_READY or beyond, so the timeline never contradicts a failure
  // banner shown on the same page.
  const analysisReady = ![
    "DRAFT",
    "SUBMITTED",
    "PROCESSING",
    "PARSING",
    "PROCESSING_FAILED",
  ].includes(underwritingCase.status);
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
    // "Draft Saved" only exists while the case IS a draft: `updatedAt` moves
    // on every later mutation (retries, status flips), so after submission it
    // would show a save time LATER than the submission itself.
    ...(submitted
      ? []
      : [
          {
            label: "Draft Saved",
            timestamp: formatDateTime(underwritingCase.updatedAt),
            state: "complete" as const,
          },
        ]),
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
  // Show the live dashboard while the JOB is active — this now spans Stage 2
  // (the background AI memo) even after the case has flipped to ANALYSIS_READY
  // at the end of Stage 1, so the two-stage progress stays visible.
  const snapshot = underwritingCase.processing
    ? toProcessingSnapshot(underwritingCase.processing)
    : null;
  // A finished job can still carry a FAILED document (partial assessment) —
  // keep the dashboard visible so the failure and its retry stay reachable.
  const hasFailedDocument = underwritingCase.documents.some(
    (d) => d.docType === "FINANCIAL_STATEMENT" && d.processingStatus === "FAILED",
  );
  const showDashboard =
    !!snapshot &&
    (isProcessingActive(snapshot.state) ||
      snapshot.stalled ||
      hasFailedDocument ||
      underwritingCase.status === "PROCESSING_FAILED");
  // Deliberately no Financial Intelligence headline (score/rating/risk band)
  // on the contractor's own page — that analysis is bank-internal until a
  // decision is made; the contractor only submits and tracks status.
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
            <h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">
              {underwritingCase.reference}
            </h1>
            <StatusBadge status={underwritingCase.status} />
          </div>
          <div className="flex items-center gap-2">
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {showDashboard && snapshot && (
            <ProcessingDashboard
              caseId={id}
              initial={{
                ...snapshot,
                headline: null,
                documents: toDocumentSnapshots(
                  underwritingCase.documents.filter((d) => d.docType === "FINANCIAL_STATEMENT"),
                ),
              }}
            />
          )}

          <div className="grid gap-6 md:grid-cols-2">
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
          </div>

          {underwritingCase.qualitative && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Profile & Track Record</CardTitle>
              </CardHeader>
              <CardContent>
                <QualitativeSummary
                  qualitative={toQualitativeInput(underwritingCase.qualitative)!}
                />
              </CardContent>
            </Card>
          )}

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

        <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain">
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
