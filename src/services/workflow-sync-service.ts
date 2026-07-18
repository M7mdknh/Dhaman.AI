/**
 * Workflow synchronization tokens (cross-role consistency).
 *
 * The case status column is the single source of truth and every transition
 * is a guarded conditional write — the database can never diverge. What CAN
 * diverge is what each role's browser is showing: `revalidatePath` refreshes
 * the server cache, but a page another user already has open never refetches
 * on its own. These tokens give every workspace a cheap poll target: the
 * client compares tokens and calls `router.refresh()` the moment the
 * underlying state moves, so contractor, RM, and Risk Officer always converge
 * on the same workflow state within seconds.
 *
 * A token is an opaque fingerprint — the client never parses it, only
 * compares equality. `updatedAt` moves on every status transition (Prisma
 * `@updatedAt`), so status + updatedAt covers all decision/routing/issuance
 * events without enumerating them.
 */
import { prisma } from "@/lib/prisma";

/** Roles allowed on the bank-side read path (mirrors getBankUser). */
const BANK_ROLES = ["RELATIONSHIP_MANAGER", "RISK_OFFICER", "ADMIN"] as const;

/** The one token formula — pages that already hold the row use this directly. */
export function caseSyncToken(status: string, updatedAt: Date): string {
  return `${status}:${updatedAt.getTime()}`;
}

async function getUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true },
  });
}

/**
 * Fingerprint of ONE case's workflow state, scoped exactly like the page
 * reads: contractors see only their company's cases, bank staff every
 * post-submission case. Null = no access or no such case.
 */
export async function getCaseSyncToken(
  userId: string,
  caseId: string,
): Promise<string | null> {
  const user = await getUser(userId);
  if (!user) return null;

  const isBank = (BANK_ROLES as readonly string[]).includes(user.role);
  const underwritingCase = await prisma.underwritingCase.findFirst({
    where: isBank
      ? { id: caseId, status: { not: "DRAFT" } }
      : { id: caseId, companyId: user.companyId ?? "__none__" },
    select: { status: true, updatedAt: true },
  });
  if (!underwritingCase) return null;
  return caseSyncToken(underwritingCase.status, underwritingCase.updatedAt);
}

/**
 * Fingerprint of the caller's whole case book (dashboard lists + stat cards).
 * Any status transition, new submission, or deletion changes the token.
 */
export async function getWorkbenchSyncToken(userId: string): Promise<string | null> {
  const user = await getUser(userId);
  if (!user) return null;

  const isBank = (BANK_ROLES as readonly string[]).includes(user.role);
  if (!isBank && !user.companyId) return "0:0";

  const aggregate = await prisma.underwritingCase.aggregate({
    where: isBank ? { status: { not: "DRAFT" } } : { companyId: user.companyId! },
    _count: true,
    _max: { updatedAt: true },
  });
  return `${aggregate._count}:${aggregate._max.updatedAt?.getTime() ?? 0}`;
}
