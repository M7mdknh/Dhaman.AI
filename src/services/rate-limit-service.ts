/**
 * Brute-force / abuse throttling for the auth endpoints.
 *
 * Backed by the append-only AuditLog table (not in-memory) so the limit is
 * shared across every serverless instance without extra infrastructure.
 * Windows are sliding and self-expiring — a blocked identity is free again
 * once its recent failures age out of the window.
 */
import { prisma } from "@/lib/prisma";

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES_PER_EMAIL = 8;
const MAX_FAILURES_PER_IP = 30;

const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REGISTRATIONS_PER_IP = 10;

function countAudits(action: string, since: Date, key: "email" | "ip", value: string) {
  return prisma.auditLog.count({
    where: { action, createdAt: { gt: since }, detail: { path: [key], equals: value } },
  });
}

/** True when this email OR source IP has exceeded the recent failed-login budget. */
export async function isLoginRateLimited(email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    countAudits("auth.login_failed", since, "email", email),
    ip ? countAudits("auth.login_failed", since, "ip", ip) : Promise.resolve(0),
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
}

/** True when this source IP has created too many accounts in the recent window. */
export async function isRegisterRateLimited(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const since = new Date(Date.now() - REGISTER_WINDOW_MS);
  const count = await countAudits("auth.registered", since, "ip", ip);
  return count >= MAX_REGISTRATIONS_PER_IP;
}
