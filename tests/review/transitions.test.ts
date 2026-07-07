import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  canDecide,
  canIssueGuarantee,
  canResumeReview,
  canStartReview,
  decisionTargetStatus,
  derivePriority,
} from "@/lib/review";

import type { CaseStatus, OfficerDecisionType } from "@/generated/prisma/enums";

const ALL_STATUSES: CaseStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "PARSING",
  "ANALYSIS_READY",
  "UNDER_REVIEW",
  "INFO_REQUESTED",
  "APPROVED",
  "DECLINED",
  "ISSUED",
];

const ALL_DECISIONS: OfficerDecisionType[] = [
  "APPROVE",
  "APPROVE_WITH_CONDITIONS",
  "REJECT",
  "REQUEST_INFO",
];

describe("review transitions", () => {
  it("review starts ONLY from ANALYSIS_READY", () => {
    for (const status of ALL_STATUSES) {
      expect(canStartReview(status)).toBe(status === "ANALYSIS_READY");
    }
  });

  it("review resumes ONLY from INFO_REQUESTED", () => {
    for (const status of ALL_STATUSES) {
      expect(canResumeReview(status)).toBe(status === "INFO_REQUESTED");
    }
  });

  it("terminal decisions are legal from UNDER_REVIEW and INFO_REQUESTED only", () => {
    for (const decision of ["APPROVE", "APPROVE_WITH_CONDITIONS", "REJECT"] as const) {
      for (const status of ALL_STATUSES) {
        expect(canDecide(status, decision)).toBe(
          status === "UNDER_REVIEW" || status === "INFO_REQUESTED",
        );
      }
    }
  });

  it("information can be requested from UNDER_REVIEW only — never twice in a row", () => {
    for (const status of ALL_STATUSES) {
      expect(canDecide(status, "REQUEST_INFO")).toBe(status === "UNDER_REVIEW");
    }
  });

  it("maps every decision to its target status", () => {
    const expected: Record<OfficerDecisionType, CaseStatus> = {
      APPROVE: "APPROVED",
      APPROVE_WITH_CONDITIONS: "APPROVED",
      REJECT: "DECLINED",
      REQUEST_INFO: "INFO_REQUESTED",
    };
    for (const decision of ALL_DECISIONS) {
      expect(decisionTargetStatus(decision)).toBe(expected[decision]);
    }
  });

  it("guarantees issue ONLY from APPROVED", () => {
    for (const status of ALL_STATUSES) {
      expect(canIssueGuarantee(status)).toBe(status === "APPROVED");
    }
  });
});

describe("derivePriority", () => {
  it("HIGH and CRITICAL risk bands force HIGH priority regardless of size", () => {
    expect(derivePriority("HIGH", new Prisma.Decimal("1000"))).toBe("HIGH");
    expect(derivePriority("CRITICAL", null)).toBe("HIGH");
  });

  it("large guarantees are HIGH even without an analysis", () => {
    expect(derivePriority(null, new Prisma.Decimal("10000000"))).toBe("HIGH");
    expect(derivePriority(null, "25000000.00")).toBe("HIGH");
  });

  it("mid-size guarantees with benign risk are NORMAL", () => {
    expect(derivePriority("LOW", new Prisma.Decimal("1000000"))).toBe("NORMAL");
    expect(derivePriority("EXCELLENT", "9999999.99")).toBe("NORMAL");
  });

  it("small, benign cases are LOW", () => {
    expect(derivePriority("EXCELLENT", new Prisma.Decimal("999999.99"))).toBe("LOW");
    expect(derivePriority("MODERATE", null)).toBe("LOW");
    expect(derivePriority(null, null)).toBe("LOW");
  });
});
