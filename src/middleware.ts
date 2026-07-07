/**
 * Route protection. Everything is private except the auth pages.
 * The session JWT is cryptographically verified here (edge-safe, jose) —
 * never trusted unverified.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

const PUBLIC_PATHS = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session && !isPublic) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  if (session && (isPublic || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect everything except Next.js internals, static assets, the health
  // probe, and the cron endpoint (which authenticates itself with CRON_SECRET
  // and carries no session cookie, so it must bypass the redirect-to-login).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/health|api/cron).*)"],
};
