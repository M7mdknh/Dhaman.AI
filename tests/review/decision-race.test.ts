/**
 * recordDecision concurrency guard (H-2). The status is read, checked, then
 * written — a stale read between check and write must NOT double-record. The
 * guard is a CONDITIONAL updateMany scoped to the legal source statuses: when
 * it moves 0 rows (another actor already decided), the decision is aborted and
 * no OfficerDecision row is created.
 *
 * The database is mocked — these tests assert the service's control flow, not
 * Postgres. `prisma` (shared by the service, recordAudit, and getOfficerUser)
 * is faked so the whole path runs in-memory.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseStatus, OfficerDecisionType } from "@/generated/prisma/enums";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  underwritingCase: { findUnique: vi.fn(), updateMany: vi.fn() },
  officerDecision: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  // Interactive transaction: run the callback with the same mocked client so
  // `tx.underwritingCase.updateMany` / `tx.officerDecision.create` are observed.
  $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { recordDecision } from "@/services/review-service";

const OFFICER = { id: "officer-1", role: "RISK_OFFICER", fullName: "Omar Alkaltham" };

/** Seeds a reviewable case in the given status with no prior AI memo. */
function seedCase(status: CaseStatus) {
  prismaMock.underwritingCase.findUnique.mockResolvedValue({
    status,
    reference: "UC-2026-000001",
    assignedOfficerId: null,
    decisionIntelligence: [],
  });
}

const approve = { decision: "APPROVE" as OfficerDecisionType, reason: "Strong financials." };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue(OFFICER);
  prismaMock.officerDecision.create.mockResolvedValue({ id: "dec-1" });
  prismaMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
  prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
});

describe("recordDecision — concurrency guard", () => {
  it("aborts when the case moved under a stale read (guard moves 0 rows)", async () => {
    seedCase("UNDER_REVIEW"); // read says decidable...
    prismaMock.underwritingCase.updateMany.mockResolvedValue({ count: 0 }); // ...but the write finds it already gone

    const result = await recordDecision(OFFICER.id, "case-1", approve);

    expect(result).toEqual({
      ok: false,
      error: "This case's status changed before the decision was recorded. Refresh and try again.",
    });
    // The whole point: no second decision row, no audit of a decision that never happened.
    expect(prismaMock.officerDecision.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("records exactly one decision when the guard passes (moves 1 row)", async () => {
    seedCase("UNDER_REVIEW");
    prismaMock.underwritingCase.updateMany.mockResolvedValue({ count: 1 });

    const result = await recordDecision(OFFICER.id, "case-1", approve);

    expect(result).toEqual({ ok: true });
    expect(prismaMock.officerDecision.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.officerDecision.create.mock.calls[0][0].data).toMatchObject({
      caseId: "case-1",
      officerId: OFFICER.id,
      decision: "APPROVE",
      conditions: null,
    });
  });

  it("moves the case BEFORE creating the decision (guard is the first write)", async () => {
    seedCase("UNDER_REVIEW");
    const order: string[] = [];
    prismaMock.underwritingCase.updateMany.mockImplementation(async () => {
      order.push("updateMany");
      return { count: 1 };
    });
    prismaMock.officerDecision.create.mockImplementation(async () => {
      order.push("create");
      return { id: "dec-1" };
    });

    await recordDecision(OFFICER.id, "case-1", approve);

    expect(order).toEqual(["updateMany", "create"]);
  });

  it("guards a terminal decision against BOTH UNDER_REVIEW and INFO_REQUESTED", async () => {
    seedCase("INFO_REQUESTED");
    prismaMock.underwritingCase.updateMany.mockResolvedValue({ count: 1 });

    await recordDecision(OFFICER.id, "case-1", { decision: "REJECT", reason: "Guarantee called." });

    const where = prismaMock.underwritingCase.updateMany.mock.calls[0][0].where;
    expect(where.id).toBe("case-1");
    expect(where.status.in).toEqual(["UNDER_REVIEW", "INFO_REQUESTED"]);
    expect(prismaMock.underwritingCase.updateMany.mock.calls[0][0].data.status).toBe("DECLINED");
  });

  it("guards REQUEST_INFO to UNDER_REVIEW only (never a re-request from INFO_REQUESTED)", async () => {
    seedCase("UNDER_REVIEW");
    prismaMock.underwritingCase.updateMany.mockResolvedValue({ count: 1 });

    await recordDecision(OFFICER.id, "case-1", {
      decision: "REQUEST_INFO",
      reason: "Need the FY2025 statement.",
    });

    const where = prismaMock.underwritingCase.updateMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(["UNDER_REVIEW"]);
    expect(prismaMock.underwritingCase.updateMany.mock.calls[0][0].data.status).toBe("INFO_REQUESTED");
  });

  it("rejects a non-officer before any case read or write", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "c-1", role: "CONTRACTOR", fullName: "X" });

    const result = await recordDecision("c-1", "case-1", approve);

    expect(result).toEqual({ ok: false, error: "Only bank staff can decide cases." });
    expect(prismaMock.underwritingCase.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.underwritingCase.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a non-decidable status without attempting the guarded write", async () => {
    seedCase("ANALYSIS_READY"); // review has not started

    const result = await recordDecision(OFFICER.id, "case-1", approve);

    expect(result.ok).toBe(false);
    expect(prismaMock.underwritingCase.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.officerDecision.create).not.toHaveBeenCalled();
  });
});
