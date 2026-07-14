/**
 * Session token signing/verification (JWT, HS256 via jose).
 *
 * Kept free of next/headers so it can run in BOTH the edge middleware and
 * Node server code. Tokens are always verified — never decoded unverified.
 */
import { jwtVerify, SignJWT } from "jose";

export type Role = "CONTRACTOR" | "RELATIONSHIP_MANAGER" | "RISK_OFFICER" | "ADMIN";

export interface SessionPayload {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
}

export const SESSION_COOKIE = "daman_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h working session

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or too short");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    fullName: payload.fullName,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      email: String(payload.email ?? ""),
      fullName: String(payload.fullName ?? ""),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}
