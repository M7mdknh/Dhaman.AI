import { CheckCircle2, Download, HelpCircle, SearchCheck, XCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { CaseStatus, OfficerDecisionType } from "@/generated/prisma/enums";

export interface ContractorDecisionView {
  decision: OfficerDecisionType;
  reason: string;
  conditions: string | null;
  createdAt: Date;
}

export interface ContractorGuaranteeView {
  reference: string;
  issueDate: Date;
  expiryDate: Date;
}

/**
 * The contractor's view of the bank decision. Deliberately partial: the
 * request-for-information message and any approval conditions are shown
 * (the applicant must act on them); internal reasoning never is.
 */
export function DecisionStatusCard({
  caseId,
  status,
  decisions,
  guarantee,
}: {
  caseId: string;
  status: CaseStatus;
  decisions: ContractorDecisionView[];
  guarantee: ContractorGuaranteeView | null;
}) {
  const relevant =
    status === "RM_REVIEWED" ||
    status === "UNDER_REVIEW" ||
    status === "INFO_REQUESTED" ||
    status === "APPROVED" ||
    status === "DECLINED" ||
    status === "ISSUED";
  if (!relevant) return null;

  const infoRequest = decisions.find((d) => d.decision === "REQUEST_INFO") ?? null;
  const terminal = decisions.find((d) => d.decision !== "REQUEST_INFO") ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Bank Decision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "RM_REVIEWED" && (
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <SearchCheck className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
            Your Relationship Manager has completed the review and sent your
            case to the Risk Officer for the final decision.
          </p>
        )}

        {status === "UNDER_REVIEW" && (
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <SearchCheck className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
            Your case is being reviewed by a Risk Officer. You will see the
            outcome here.
          </p>
        )}

        {status === "INFO_REQUESTED" && infoRequest && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-[13px] font-medium text-amber-900">
              <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              The bank has requested more information
            </p>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-amber-900/90">
              {infoRequest.reason}
            </p>
            <p className="mt-2 text-[11px] text-amber-900/70">
              Requested {formatDateTime(infoRequest.createdAt)}
            </p>
          </div>
        )}

        {(status === "APPROVED" || status === "ISSUED") && terminal && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              <span>
                Your Letter of Guarantee request was{" "}
                <span className="font-medium text-foreground">
                  approved{terminal.decision === "APPROVE_WITH_CONDITIONS" && " with conditions"}
                </span>{" "}
                on {formatDate(terminal.createdAt)}.
              </span>
            </p>
            {terminal.decision === "APPROVE_WITH_CONDITIONS" && terminal.conditions && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conditions
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                  {terminal.conditions}
                </p>
              </div>
            )}
            {status === "ISSUED" && guarantee && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground">{guarantee.reference}</p>
                  <p className="text-xs text-muted-foreground">
                    Issued {formatDate(guarantee.issueDate)} · valid until{" "}
                    {formatDate(guarantee.expiryDate)}
                  </p>
                </div>
                <a
                  href={`/api/guarantees/${caseId}`}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  <Download className="size-4" aria-hidden />
                  Download Guarantee
                </a>
              </div>
            )}
            {status === "APPROVED" && (
              <p className="text-xs text-muted-foreground">
                The Letter of Guarantee will be available for download here once
                issued by the bank.
              </p>
            )}
          </div>
        )}

        {status === "DECLINED" && terminal && (
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
            <span>
              After review, the bank was unable to approve this guarantee
              request ({formatDate(terminal.createdAt)}). Please contact your
              relationship manager for next steps.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
