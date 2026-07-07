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
import { isLoginRateLimited, isRegisterRateLimited } from "@/services/rate-limit-service";

import type { SessionPayload } from "@/lib/auth/token";
import type { User } from "@/generated/prisma/client";

export type LoginOutcome =
  | { ok: true; session: SessionPayload }
  | { ok: false; reason: "invalid" | "rate_limited" };

export type RegisterOutcome =
  | { ok: true; session: SessionPayload }
  | { ok: false; error: string; rateLimited?: boolean };

function toSessionPayload(user: User): SessionPayload {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

/**
 * Verifies credentials. Never reveals whether the email exists. Every failure
 * is audited with the attempted email and source IP so the rate limiter can
 * see stuffing against unknown emails too.
 */
export async function verifyCredentials(
  email: string,
  password: string,
  ip: string | null,
): Promise<LoginOutcome> {
  const normalizedEmail = email.toLowerCase();

  if (await isLoginRateLimited(normalizedEmail, ip)) {
    return { ok: false, reason: "rate_limited" };
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    await recordAudit({ action: "auth.login_failed", detail: { email: normalizedEmail, ip } });
    return { ok: false, reason: "invalid" };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordAudit({
      action: "auth.login_failed",
      actorId: user.id,
      detail: { email: normalizedEmail, ip },
    });
    return { ok: false, reason: "invalid" };
  }

  await recordAudit({ action: "auth.login", actorId: user.id });
  return { ok: true, session: toSessionPayload(user) };
}

export async function registerContractor(input: {
  fullName: string;
  email: string;
  password: string;
  ip: string | null;
}): Promise<RegisterOutcome> {
  if (await isRegisterRateLimited(input.ip)) {
    return {
      ok: false,
      error: "Too many accounts created recently. Please wait a while and try again.",
      rateLimited: true,
    };
  }

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

  await recordAudit({ action: "auth.registered", actorId: user.id, detail: { ip: input.ip } });
  return { ok: true, session: toSessionPayload(user) };
}

export function recordLogout(userId: string) {
  return recordAudit({ action: "auth.logout", actorId: userId });
}
