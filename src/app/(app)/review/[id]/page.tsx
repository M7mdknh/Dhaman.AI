import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, FileCheck2, Hourglass } from "lucide-react";

import { FinancialIntelligencePanel } from "@/components/analysis/financial-intelligence-panel";
import { CaseTimeline, type TimelineEntry } from "@/components/cases/case-timeline";
import { StatusBadge } from "@/components/cases/status-badge";
import { CompanySummary, ContractSummary } from "@/components/cases/summary-sections";
import { DecisionSection } from "@/components/decision/decision-section";
import { DecisionForm } from "@/components/review/decision-form";
import {
  DecisionHistory,
  officerDecisionLabel,
  type DecisionView,
} from "@/components/review/decision-history";
import { DocumentsPanel } from "@/components/review/documents-panel";
import { IssueGuaranteeButton } from "@/components/review/issue-guarantee-button";
import { NotesPanel, type NoteView } from "@/components/review/notes-panel";
import { PriorityBadge } from "@/components/review/priority-badge";
import {
  ResumeReviewButton,
  StartReviewButton,
} from "@/components/review/review-lifecycle-buttons";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { guaranteeTypeLabel } from "@/lib/case-constants";
import { toCompanyInput, toContractInput } from "@/lib/case-view";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { derivePriority } from "@/lib/review";
import { cn } from "@/lib/utils";
import { getCaseForReview, type ReviewCase } from "@/services/officer-case-service";
import { buildFinancialIntelligence } from "@/services/finance/financial-intelligence-service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Case Review" };

/** Every lifecycle event the bank cares about; future events append as they happen. */
function buildTimeline(reviewCase: ReviewCase): TimelineEntry[] {
  const memo = reviewCase.decisionIntelligence[0] ?? null;
  const terminalDecision = reviewCase.officerDecisions.find(
    (d) => d.decision !== "REQUEST_INFO",
  );
  const extractionDone = reviewCase.documents.some((d) => d.processingStatus === "COMPLETED");
  const analysisReady = reviewCase.financialStatements.length > 0;

  return [
    {
      label: "Created",
      timestamp: formatDateTime(reviewCase.createdAt),
      state: "complete",
    },
    {
      label: "Submitted",
      timestamp: reviewCase.submittedAt ? formatDateTime(reviewCase.submittedAt) : undefined,
      state: reviewCase.submittedAt ? "complete" : "upcoming",
    },
    { label: "Financial Extraction", state: extractionDone ? "complete" : "upcoming" },
    { label: "Financial Analysis", state: analysisReady ? "complete" : "upcoming" },
    {
      label: "Decision Intelligence",
      timestamp: memo ? formatDateTime(memo.createdAt) : undefined,
      state: memo ? "complete" : "upcoming",
    },
    {
      label: "Officer Review Started",
      timestamp: reviewCase.reviewStartedAt
        ? formatDateTime(reviewCase.reviewStartedAt)
        : undefined,
      state: reviewCase.reviewStartedAt ? "complete" : "upcoming",
    },
    {
      label: terminalDecision
        ? `Decision — ${officerDecisionLabel(terminalDecision.decision)}`
        : "Decision",
      timestamp: terminalDecision ? formatDateTime(terminalDecision.createdAt) : undefined,
      state: terminalDecision ? "complete" : "upcoming",
    },
    {
      label: "Letter of Guarantee",
      timestamp: reviewCase.guarantee
        ? formatDateTime(reviewCase.guarantee.createdAt)
        : undefined,
      state: reviewCase.guarantee ? "complete" : "upcoming",
    },
  ];
}

function HeaderFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default async function ReviewCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "CONTRACTOR") notFound();

  const { id } = await params;
  const reviewCase = await getCaseForReview(session.userId, id);
  if (!reviewCase) notFound();

  const contract = reviewCase.contractDetails;
  const report = buildFinancialIntelligence(reviewCase.financialStatements, contract);
  const priority = derivePriority(
    report?.risk.band ?? null,
    contract?.guaranteeAmount ?? null,
  );
  const memo = reviewCase.decisionIntelligence[0] ?? null;
  const status = reviewCase.status;
  const guaranteeAmountLabel = contract
    ? formatMoney(contract.guaranteeAmount, contract.currency)
    : "—";

  const decisions: DecisionView[] = reviewCase.officerDecisions.map((d) => ({
    id: d.id,
    decision: d.decision,
    reason: d.reason,
    conditions: d.conditions,
    officer: d.officer.fullName,
    createdAt: d.createdAt.toISOString(),
  }));
  const notes: NoteView[] = reviewCase.notes.map((n) => ({
    id: n.id,
    author: n.author?.fullName ?? "Former staff member",
    content: n.content,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      {/* ---- Case header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Review Queue
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {reviewCase.reference}
          </h1>
          <StatusBadge status={status} />
          <PriorityBadge priority={priority} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {reviewCase.company.name}
          {contract ? ` — ${contract.contractTitle}` : ""}
        </p>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
            <HeaderFact label="Company" value={reviewCase.company.name} />
            <HeaderFact
              label="Guarantee Type"
              value={contract ? guaranteeTypeLabel(contract.guaranteeType) : "—"}
            />
            <HeaderFact label="Guarantee Amount" value={guaranteeAmountLabel} />
            <HeaderFact
              label="Contract Value"
              value={contract ? formatMoney(contract.contractValue, contract.currency) : "—"}
            />
            <HeaderFact
              label="Submitted"
              value={reviewCase.submittedAt ? formatDate(reviewCase.submittedAt) : "—"}
            />
            <HeaderFact
              label="Assigned Officer"
              value={reviewCase.assignedOfficer?.fullName ?? "Unassigned"}
            />
          </dl>
        </CardContent>
      </Card>

      {/* ---- Three-column workspace: timeline | intelligence | decision */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        <div className="order-2 xl:order-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <CaseTimeline entries={buildTimeline(reviewCase)} />
            </CardContent>
          </Card>
        </div>

        <div className="order-1 min-w-0 space-y-6 xl:order-2">
          <DecisionSection
            caseId={id}
            decision={memo}
            eligible={reviewCase.financialStatements.length > 0}
          />

          <section aria-label="Financial intelligence">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Financial Intelligence
            </h2>
            {report ? (
              <FinancialIntelligencePanel report={report} />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No parsed financial statements yet — the analysis appears once
                  extraction completes.
                </CardContent>
              </Card>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Company Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <CompanySummary company={toCompanyInput(reviewCase.company)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contract Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {contract ? (
                  <ContractSummary contract={toContractInput(contract)} />
                ) : (
                  <p className="text-sm text-muted-foreground">No contract details.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentsPanel
                documents={reviewCase.documents
                  .filter((d) => d.docType === "FINANCIAL_STATEMENT")
                  .map((d) => ({
                    id: d.id,
                    fileName: d.fileName,
                    fileSize: d.fileSize,
                    fiscalYear: d.fiscalYear,
                    processingStatus: d.processingStatus,
                    extractionError: d.extraction?.error ?? null,
                  }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* ---- Sticky decision sidebar */}
        <div className="order-3 space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Officer Decision</CardTitle>
              <p className="text-xs text-muted-foreground">
                The final decision always rests with the Risk Officer — the AI only assists.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(status === "SUBMITTED" || status === "PARSING") && (
                <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                  <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Statement extraction is still in progress — the case becomes
                  reviewable once the analysis is ready.
                </p>
              )}

              {status === "ANALYSIS_READY" && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    Viewing never changes case state. Start the review to take
                    ownership and unlock decisions.
                  </p>
                  <StartReviewButton caseId={id} reference={reviewCase.reference} />
                </>
              )}

              {status === "UNDER_REVIEW" && (
                <DecisionForm caseId={id} reference={reviewCase.reference} />
              )}

              {status === "INFO_REQUESTED" && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    Waiting on information from the applicant. Resume the review
                    once it arrives, or record a terminal decision below.
                  </p>
                  <ResumeReviewButton caseId={id} reference={reviewCase.reference} />
                  <DecisionForm
                    caseId={id}
                    reference={reviewCase.reference}
                    allowRequestInfo={false}
                  />
                </>
              )}

              {status === "APPROVED" && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    Approved. Issue the Letter of Guarantee to complete the case.
                  </p>
                  <IssueGuaranteeButton
                    caseId={id}
                    reference={reviewCase.reference}
                    amountLabel={guaranteeAmountLabel}
                  />
                </>
              )}

              {status === "ISSUED" && reviewCase.guarantee && (
                <div className="space-y-3">
                  <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                    <FileCheck2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                    Letter of Guarantee{" "}
                    <span className="font-medium text-foreground">
                      {reviewCase.guarantee.reference}
                    </span>{" "}
                    issued {formatDate(reviewCase.guarantee.issueDate)} · expires{" "}
                    {formatDate(reviewCase.guarantee.expiryDate)}.
                  </p>
                  <a
                    href={`/api/guarantees/${id}`}
                    className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                  >
                    <Download className="size-4" aria-hidden />
                    Download Letter of Guarantee
                  </a>
                </div>
              )}

              {status === "DECLINED" && (
                <p className="text-[13px] text-muted-foreground">
                  This case was declined. The decision record is below.
                </p>
              )}

              {decisions.length > 0 && (
                <div className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Decision Record
                  </h3>
                  <DecisionHistory decisions={decisions} />
                </div>
              )}
            </CardContent>
          </Card>

          <NotesPanel caseId={id} notes={notes} />
        </div>
      </div>
    </div>
  );
}
