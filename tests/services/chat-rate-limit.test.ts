/**
 * isChatRateLimited (H-1). Insight Chat is the one uncapped LLM egress —
 * each message is a billed OpenAI call — so it is throttled per user, counted
 * from the `officer.insight_queried` audit event the chat route records within
 * a sliding window. The database is mocked: these tests assert the budget
 * boundary and the exact count query, not Postgres.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  auditLog: { count: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { isChatRateLimited } from "@/services/rate-limit-service";

// Mirrors the service constants (MAX_CHATS_PER_USER = 20, window = 1 minute).
const MAX = 20;
const WINDOW_MS = 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isChatRateLimited", () => {
  it("allows a user below the budget", async () => {
    prismaMock.auditLog.count.mockResolvedValue(MAX - 1);
    expect(await isChatRateLimited("user-1")).toBe(false);
  });

  it("blocks a user exactly at the budget (>=, not >)", async () => {
    prismaMock.auditLog.count.mockResolvedValue(MAX);
    expect(await isChatRateLimited("user-1")).toBe(true);
  });

  it("blocks a user over the budget", async () => {
    prismaMock.auditLog.count.mockResolvedValue(MAX + 5);
    expect(await isChatRateLimited("user-1")).toBe(true);
  });

  it("allows a brand-new user (no prior queries)", async () => {
    prismaMock.auditLog.count.mockResolvedValue(0);
    expect(await isChatRateLimited("user-1")).toBe(false);
  });

  it("counts only this user's insight queries inside the sliding window", async () => {
    prismaMock.auditLog.count.mockResolvedValue(0);
    const before = Date.now();

    await isChatRateLimited("user-42");

    expect(prismaMock.auditLog.count).toHaveBeenCalledTimes(1);
    const where = prismaMock.auditLog.count.mock.calls[0][0].where;
    expect(where.action).toBe("officer.insight_queried");
    expect(where.actorId).toBe("user-42");

    // Window lower bound is ~now − 60s (sliding, self-expiring).
    const gt = where.createdAt.gt as Date;
    expect(gt).toBeInstanceOf(Date);
    const windowStart = before - WINDOW_MS;
    expect(gt.getTime()).toBeGreaterThanOrEqual(windowStart - 1000);
    expect(gt.getTime()).toBeLessThanOrEqual(windowStart + 1000);
  });
});
