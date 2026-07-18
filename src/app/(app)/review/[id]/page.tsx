import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft, Download, FileCheck2, Hourglass } from "lucide-react";

import { FinancialIntelligencePanel } from "@/components/analysis/financial-intelligence-panel";
import { AssessmentUnavailable, ValidationReport } from "@/components/analysis/validation-report";
import { AdminDeleteCaseDialog } from "@/components/review/admin-delete-case-dialog";
import { AdminEditContractDialog } from "@/components/review/admin-edit-contract-dialog";
import { CaseTimeline, type TimelineEntry } from "@/components/cases/case-timeline";
import { StatusBadge } from "@/components/cases/status-badge";
import {
  CompanySummary,
  ContractSummary,
  QualitativeSummary,
} from "@/components/cases/summary-sections";
import { DecisionSection } from "@/components/decision/decision-section";
import { DecisionForm } from "@/components/review/decision-form";
import { decisionOptionLabel } from "@/components/review/decision-options";
import {
  DecisionHistory,
  officerDecisionLabel,
  type DecisionView,
} from "@/components/review/decision-history";
import { DocumentsPanel } from "@/components/review/documents-panel";
import { IssueGuaranteeButton } from "@/components/review/issue-guarantee-button";
import { InsightChat } from "@/components/insight/insight-chat";
import { NotesPanel, type NoteView } from "@/components/review/notes-panel";
import { PriorityBadge } from "@/components/review/priority-badge";
import {
  RmAssessmentPanel,
  type MemoRevisionView,
  type RmSuggestedDecisionView,
} from "@/components/review/rm-assessment-panel";
import { RmReviewForm } from "@/components/review/rm-review-form";
import {
  ResumeReviewButton,
  StartReviewButton,
} from "@/components/review/review-lifecycle-buttons";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { guaranteeTypeLabel } from "@/lib/case-constants";
import { toCompanyInput, toContractInput, toQualitativeInput } from "@/lib/case-view";
import { buildValidationReport } from "@/lib/finance/confidence";
import { buildRatioEvidence } from "@/lib/finance/ratio-evidence";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { derivePriority } from "@/lib/review";
import { cn } from "@/lib/utils";
import { getCaseForReview, type ReviewCase } from "@/services/officer-case-service";
import { ensureDecisionIntelligence } from "@/services/decision/decision-intelligence-service";
import { validateFinancialIntegrity } from "@/services/finance/financial-integrity-validator";
import {
  buildFinancialIntelligence,
  toIdentityInputs,
} from "@/services/finance/financial-intelligence-service";

import type { FinancialIntelligenceReport } from "@/lib/finance/types";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Case Review" };

/**
 * Computes data-driven suggestion bubbles for Insight Chat from the
 * deterministic engine output. Bubbles reflect what's actually in this
 * specific case — high flags, missing data, and the risk band — rather
 * than a generic template.
 */
function buildInsightBubbles(report: FinancialIntelligenceReport): string[] {
  const bubbles: string[] = [];
  const highFlags = report.flags.filter((f) => f.severity === "HIGH");
  const hasMissing = report.risk.missingInputs.length > 0;
  const band = report.risk.band;

  for (const flag of highFlags.slice(0, 2)) {
    const t = flag.type;
    if (t.includes("DEBT")) {
      bubbles.push("What's driving the debt spike?");
    } else if (t.includes("CASH_FLOW") || t.includes("NEGATIVE_OPERATING") || t.includes("OCF")) {
      bubbles.push("Why is operating cash flow negative?");
    } else if (t.includes("REVENUE_SPIKE")) {
      bubbles.push("Is the revenue spike sustainable?");
    } else if (t.includes("REVENUE_DECLINE")) {
      bubbles.push("What is causing the revenue decline?");
    } else if (t.includes("EQUITY")) {
      bubbles.push("What does the equity position mean?");
    } else if (t.includes("COVERAGE") || t.includes("INTEREST")) {
      bubbles.push("Explain the interest coverage concern");
    } else {
      bubbles.push(`Explain the ${t.toLowerCase().replace(/_/g, " ")} flag`);
    }
  }

  if (band === "MODERATE" && !bubbles.some((b) => b.includes("condition"))) {
    bubbles.push("What conditions should I attach?");
  } else if ((band === "HIGH" || band === "CRITICAL") && !bubbles.some((b) => b.includes("risk"))) {
    bubbles.push("What are the main risk concerns?");
  }

  if (hasMissing && bubbles.length < 4) {
    bubbles.push("What financial data is missing?");
  }

  bubbles.push("Summarize this case for my decision note");

  return [...new Set(bubbles)].slice(0, 4);
}

/** Every lifecycle event the bank cares about; future events append as they happen. */
/** `analysisComplete` must be the VALIDATED-report flag (report !== null) —
 * statement rows alone can exist yet fail integrity validation, and a green
 * "Financial Analysis" check above a red "assessment could not be completed"
 * verdict would contradict the page. */
function buildTimeline(reviewCase: ReviewCase, analysisComplete: boolean): TimelineEntry[] {
  const analysisReady = analysisComplete;
  const memo = reviewCase.decisionIntelligence[0] ?? null;
  const terminalDecision = reviewCase.officerDecisions.find(
    (d) => d.decision !== "REQUEST_INFO",
  );
  const extractionDone = reviewCase.documents.some((d) => d.processingStatus === "COMPLETED");

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
      label: "RM Review",
      timestamp: reviewCase.rmSubmittedAt
        ? formatDateTime(reviewCase.rmSubmittedAt)
        : undefined,
      state: reviewCase.rmSubmittedAt ? "complete" : "upcoming",
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
  const report = buildFinancialIntelligence(
    reviewCase.financialStatements,
    contract,
    toIdentityInputs(reviewCase.company.name, reviewCase.documents),
    reviewCase.qualitative,
    reviewCase.company.sector,
  );
  // The exact numerator/denominator behind every ratio, so the officer can
  // click any figure and see which statement lines produced it.
  const ratioEvidence = report ? buildRatioEvidence(reviewCase.financialStatements) : undefined;
  // The same pure check the engine gates on — read here to TELL the officer how
  // far the assessment can be trusted. Never re-judges it.
  const integrity = validateFinancialIntegrity(reviewCase.financialStatements);
  // Statements that FAILED extraction never reached the validator; they cap
  // confidence at Medium and explain the limited trend analysis honestly.
  // A year still covered by another document's comparative column is not unread.
  const unreadYears = reviewCase.documents
    .filter(
      (d) =>
        d.docType === "FINANCIAL_STATEMENT" &&
        d.processingStatus === "FAILED" &&
        d.fiscalYear !== null &&
        !reviewCase.financialStatements.some((s) => s.fiscalYear === d.fiscalYear),
    )
    .map((d) => d.fiscalYear!)
    .sort((a, b) => b - a);
  const validation = buildValidationReport(integrity, unreadYears);
  // Statements exist but nothing survived validation: the recommendation was
  // never produced, so the workflow must not pretend one is coming.
  const validationBlocked = reviewCase.financialStatements.length > 0 && report === null;
  const priority = derivePriority(
    report?.overall.band ?? null,
    contract?.guaranteeAmount ?? null,
  );
  const memo = reviewCase.decisionIntelligence[0] ?? null;
  const status = reviewCase.status;
  // "Ready" means there is a trustworthy assessment to explain — not merely
  // that rows exist. Statements that failed validation produce no memo, so
  // asking for one would only spin.
  const analysisReady = report !== null;
  const isRm = session.role === "RELATIONSHIP_MANAGER";
  // Newest-first (ordered by version desc in the service).
  const latestRevision = reviewCase.memoRevisions[0] ?? null;
  const latestRevisionView: MemoRevisionView | null = latestRevision
    ? {
        version: latestRevision.version,
        summary: latestRevision.summary,
        relationshipContext: latestRevision.relationshipContext,
        author: latestRevision.author?.fullName ?? "Former staff member",
        createdAt: latestRevision.createdAt.toISOString(),
      }
    : null;
  const suggestedDecision = reviewCase.rmSuggestedDecisions[0] ?? null;
  const suggestedDecisionView: RmSuggestedDecisionView | null = suggestedDecision
    ? {
        decision: suggestedDecision.decision,
        reason: suggestedDecision.reason,
        conditions: suggestedDecision.conditions,
        rm: suggestedDecision.rm.fullName,
        createdAt: suggestedDecision.createdAt.toISOString(),
      }
    : null;

  // Lazy AI: a Risk Officer opening the case is one of the two triggers for the
  // underwriting memo (the other is the explicit "Generate AI Analysis" button).
  // Fire it in the background via `after()` so the page renders immediately —
  // the memo is prepared without ever blocking the workflow. Idempotent and
  // deduped, and a no-op once a memo exists.
  const autoGenerating = analysisReady && !memo;
  if (autoGenerating) {
    after(() => ensureDecisionIntelligence(id));
  }

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
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">
              {reviewCase.reference}
            </h1>
            <StatusBadge status={status} />
            <PriorityBadge priority={priority} />
          </div>
          {session.role === "ADMIN" && (
            <div className="flex items-center gap-2">
              {contract && (
                <AdminEditContractDialog
                  caseId={id}
                  reference={reviewCase.reference}
                  defaults={toContractInput(contract)}
                />
              )}
              <AdminDeleteCaseDialog caseId={id} reference={reviewCase.reference} />
            </div>
          )}
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

      {/* ---- Two-column workspace: intelligence | decision rail. The center
           column carries the full Financial Intelligence panel, so it gets
           every pixel it can — the timeline lives in the decision rail. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          {(latestRevisionView || reviewCase.rmSubmittedAt) && (
            <RmAssessmentPanel
              revision={latestRevisionView}
              revisionCount={reviewCase.memoRevisions.length}
              routedBy={reviewCase.rmReviewer?.fullName ?? null}
              routedAt={reviewCase.rmSubmittedAt?.toISOString() ?? null}
              suggestedDecision={suggestedDecisionView}
            />
          )}

          <DecisionSection
            caseId={id}
            decision={memo}
            eligible={analysisReady}
            autoGenerating={autoGenerating}
            validationBlocked={validationBlocked}
          />

          <section aria-label="Financial intelligence">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Financial Intelligence
              </h2>
              {report && (
                <a
                  href={`/api/cases/${id}/analysis-pdf`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Download className="size-3.5" aria-hidden />
                  Export PDF
                </a>
              )}
            </div>
            {report ? (
              <FinancialIntelligencePanel
                report={report}
                integrity={integrity}
                unreadYears={unreadYears}
                ratioEvidence={ratioEvidence}
              />
            ) : validationBlocked ? (
              // Statements were read but not trusted. The verdict slot states
              // that plainly rather than sitting empty — a missing verdict must
              // never read as a neutral one.
              <div className="space-y-6">
                <AssessmentUnavailable />
                <ValidationReport report={validation} />
              </div>
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
                <CardAction>
                  <Link
                    href={`/companies/${reviewCase.companyId}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  >
                    History with the bank
                  </Link>
                </CardAction>
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
              <CardTitle className="text-sm">Profile & Track Record (KYC)</CardTitle>
            </CardHeader>
            <CardContent>
              {reviewCase.qualitative ? (
                <QualitativeSummary
                  qualitative={toQualitativeInput(reviewCase.qualitative)!}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  This case predates the KYC questionnaire — the qualitative pillar is
                  excluded from its grade.
                </p>
              )}
            </CardContent>
          </Card>

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

        {/* ---- Sticky decision rail: decision (or RM review), timeline, notes */}
        {/* The rail is regularly TALLER than the viewport (form + timeline +
            notes). A plain sticky rail pins its top and buries everything
            below the fold until the reader reaches the bottom of the much
            longer analysis column — so the rail scrolls INDEPENDENTLY,
            capped at viewport height. */}
        <div className="rise-in-stagger space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
          {isRm ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">RM Review</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Refine the AI draft, add relationship context, and route the
                  package. The final decision rests with the Risk Officer.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {(status === "SUBMITTED" ||
                  status === "PROCESSING" ||
                  status === "PARSING") && (
                  <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                    <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Statement extraction is still in progress — the memo can be
                    reviewed once the analysis is ready.
                  </p>
                )}

                {status === "PROCESSING_FAILED" && (
                  <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                    <Hourglass className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                    Financial processing did not complete for this case. The
                    applicant can retry the analysis from their side.
                  </p>
                )}

                {(status === "ANALYSIS_READY" || status === "RM_REVIEWED") && (
                  <>
                    {status === "RM_REVIEWED" && (
                      <p className="text-[13px] text-muted-foreground">
                        Routed to the Risk Officer
                        {reviewCase.rmSubmittedAt
                          ? ` on ${formatDate(reviewCase.rmSubmittedAt)}`
                          : ""}
                        . You can keep refining the memo until the review starts.
                      </p>
                    )}
                    <RmReviewForm
                      caseId={id}
                      reference={reviewCase.reference}
                      defaultSummary={latestRevisionView?.summary ?? memo?.summary ?? ""}
                      defaultContext={latestRevisionView?.relationshipContext ?? ""}
                      canSubmit={status === "ANALYSIS_READY"}
                    />
                  </>
                )}

                {(status === "UNDER_REVIEW" || status === "INFO_REQUESTED") && (
                  <p className="text-[13px] text-muted-foreground">
                    The Risk Officer&apos;s review is in progress — memo
                    refinements are locked.
                  </p>
                )}

                {(status === "APPROVED" || status === "DECLINED" || status === "ISSUED") && (
                  <p className="text-[13px] text-muted-foreground">
                    This case has been decided by the Risk Officer. The decision
                    record is below.
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
          ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Officer Decision</CardTitle>
              <p className="text-xs text-muted-foreground">
                The final decision always rests with the Risk Officer — the AI only assists.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(status === "SUBMITTED" ||
                status === "PROCESSING" ||
                status === "PARSING") && (
                <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                  <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Statement extraction is still in progress — the case becomes
                  reviewable once the analysis is ready.
                </p>
              )}

              {status === "PROCESSING_FAILED" && (
                <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                  <Hourglass className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  Financial processing did not complete for this case. The
                  applicant can retry the analysis from their side — it becomes
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

              {status === "RM_REVIEWED" && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    Reviewed and routed by{" "}
                    {reviewCase.rmReviewer?.fullName ?? "the Relationship Manager"}.
                    Start the review to take ownership and unlock decisions.
                  </p>
                  <StartReviewButton caseId={id} reference={reviewCase.reference} />
                </>
              )}

              {suggestedDecisionView &&
                (status === "UNDER_REVIEW" || status === "INFO_REQUESTED") && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="text-[13px] font-medium text-foreground">
                      RM suggested: {decisionOptionLabel(suggestedDecisionView.decision)}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {suggestedDecisionView.reason}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      — {suggestedDecisionView.rm}, a recommendation only.
                    </p>
                  </div>
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
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <CaseTimeline entries={buildTimeline(reviewCase, analysisReady)} />
            </CardContent>
          </Card>

          <NotesPanel caseId={id} notes={notes} authorName={session.fullName} />
        </div>
      </div>

      {/* Rendered outside the staggered-entrance rail: InsightChat is a fixed
          floating widget, and an ancestor with an in-flight CSS animation
          would briefly become its containing block (transform side effect),
          pinning it to the rail instead of the viewport for a moment. */}
      {report && <InsightChat caseId={id} initialBubbles={buildInsightBubbles(report)} />}
    </div>
  );
}
