/**
 * GET /api/cases/search?q=<query>
 *
 * Lightweight case lookup for the ⌘K command palette. Bank staff only —
 * contractors never search another party's cases. Returns at most 8 minimal
 * hits (id / reference / company / status); no engine output, no PII.
 */
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { searchCasesForPalette } from "@/services/officer-case-service";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ hits: [] }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchCasesForPalette(session.userId, query.slice(0, 120));
  return NextResponse.json({ hits });
}
