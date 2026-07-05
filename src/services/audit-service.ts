import { prisma } from "@/lib/prisma";

import type { Prisma } from "@/generated/prisma/client";

/**
 * Append-only audit trail. Every state-changing operation records an entry.
 * There is intentionally no update or delete API for audit logs.
 */
export function recordAudit(params: {
  action: string;
  actorId?: string | null;
  caseId?: string | null;
  detail?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      action: params.action,
      actorId: params.actorId ?? null,
      caseId: params.caseId ?? null,
      detail: params.detail,
    },
  });
}
