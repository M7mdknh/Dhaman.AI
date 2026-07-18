/**
 * Server-side session access (reads/writes the httpOnly session cookie).
 * For the edge middleware, use lib/auth/token.ts directly.
 */
import { cookies, headers } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/token";

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await signSessionToken(payload);
  // `Secure` must follow the ACTUAL connection, not NODE_ENV: a production
  // build served over plain http (localhost demo) with a Secure cookie is
  // silently dropped by Safari/WebKit — sign-in "succeeds" but every next
  // click bounces to /login. Behind TLS (Vercel etc.) x-forwarded-proto is
  // https and the cookie stays Secure.
  const proto = (await headers()).get("x-forwarded-proto");
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto ? proto.split(",")[0].trim() === "https" : false,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
