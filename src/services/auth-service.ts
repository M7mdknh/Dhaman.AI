/**
 * Authentication business logic. The only auth code that touches Prisma.
 *
 * Self-registration always creates a CONTRACTOR. Risk Officer and Admin
 * accounts are provisioned by an Admin (Sprint 0: via seed) — a bank never
 * lets the public register as an officer.
 */
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/services/audit-service";

import type { SessionPayload } from "@/lib/auth/token";
import type { User } from "@/generated/prisma/client";

function toSessionPayload(user: User): SessionPayload {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

/** Returns the session payload on success, null on any failure (no detail leaks). */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordAudit({ action: "auth.login_failed", detail: { email: user.email } });
    return null;
  }

  await recordAudit({ action: "auth.login", actorId: user.id });
  return toSessionPayload(user);
}

export async function registerContractor(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<{ ok: true; session: SessionPayload } | { ok: false; error: string }> {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const user = await prisma.user.create({
    data: {
      email,
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      role: "CONTRACTOR",
    },
  });

  await recordAudit({ action: "auth.registered", actorId: user.id });
  return { ok: true, session: toSessionPayload(user) };
}

export function recordLogout(userId: string) {
  return recordAudit({ action: "auth.logout", actorId: userId });
}
