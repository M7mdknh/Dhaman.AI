/**
 * Pure review-workflow rules (Sprint 5). The single source of truth for
 * which officer action is legal in which case status, and what status it
 * produces. No I/O — the review service enforces these against the DB and
 * this module is unit-tested exhaustively.
 */
import { Prisma } from "@/generated/prisma/client";

import { PRIORITY } from "@/lib/finance/thresholds";

import type { CaseStatus, OfficerDecisionType } from "@/generated/prisma/enums";
import type { RiskBand } from "@/lib/finance/types";

/** Statuses that appear in the officer queue at all (post-submission). */
export const QUEUE_STATUSES: CaseStatus[] = [
  "SUBMITTED",
  "PARSING",
  "ANALYSIS_READY",
  "UNDER_REVIEW",
  "INFO_REQUESTED",
  "APPROVED",
  "DECLINED",
  "ISSUED",
];

/** Awaiting officer work: the queue's default "Pending" tab. */
export const PENDING_STATUSES: CaseStatus[] = [
  "ANALYSIS_READY",
  "UNDER_REVIEW",
  "INFO_REQUESTED",
];

/** A decision has been recorded (terminal or issued). */
export const DECIDED_STATUSES: CaseStatus[] = ["APPROVED", "DECLINED", "ISSUED"];

export function canStartReview(status: CaseStatus): boolean {
  return status === "ANALYSIS_READY";
}

/** INFO_REQUESTED → back to active review once the information arrives. */
export function canResumeReview(status: CaseStatus): boolean {
  return status === "INFO_REQUESTED";
}

/**
 * Decision legality. Terminal decisions may also close out a case that is
 * still waiting on requested information; asking for information twice in a
 * row is not a decision event.
 */
export function canDecide(status: CaseStatus, decision: OfficerDecisionType): boolean {
  if (decision === "REQUEST_INFO") return status === "UNDER_REVIEW";
  return status === "UNDER_REVIEW" || status === "INFO_REQUESTED";
}

/** Status a recorded decision moves the case to. */
export function decisionTargetStatus(decision: OfficerDecisionType): CaseStatus {
  switch (decision) {
    case "APPROVE":
    case "APPROVE_WITH_CONDITIONS":
      return "APPROVED";
    case "REJECT":
      return "DECLINED";
    case "REQUEST_INFO":
      return "INFO_REQUESTED";
  }
}

export function canIssueGuarantee(status: CaseStatus): boolean {
  return status === "APPROVED";
}

export type CasePriority = "HIGH" | "NORMAL" | "LOW";

/**
 * Deterministic queue priority: risk band and exposure size, never a
 * hand-maintained field. Unknown risk (no analysis yet) with a large
 * guarantee still surfaces as HIGH.
 */
export function derivePriority(
  riskBand: RiskBand | null,
  guaranteeAmount: Prisma.Decimal | string | null,
): CasePriority {
  const amount = guaranteeAmount === null ? null : new Prisma.Decimal(guaranteeAmount);
  if (riskBand !== null && (PRIORITY.highRiskBands as readonly string[]).includes(riskBand)) {
    return "HIGH";
  }
  if (amount?.gte(PRIORITY.guaranteeHigh)) return "HIGH";
  if (amount?.gte(PRIORITY.guaranteeNormal)) return "NORMAL";
  return "LOW";
}
