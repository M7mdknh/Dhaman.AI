/**
 * Scheduled processing drainer — the DURABLE executor of the async financial
 * pipeline on serverless hosts. The request-time `after()` trigger from
 * submission/retry is best-effort (bound to that invocation's budget); this
 * cron is the authoritative backstop: it reclaims jobs a killed runner left
 * RUNNING and runs any QUEUED jobs, with a long `maxDuration` of its own.
 *
 * Auth: Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 * It is excluded from the auth middleware (no session), so the bearer check
 * here is the ONLY gate — the endpoint refuses to run without a match.
 */
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { drainProcessingQueue } from "@/services/case-processing-service";

export const dynamic = "force-dynamic";
// The pipeline (OCR + parsing + AI) is heavy; give the drainer real headroom.
// 300s is the Vercel Pro ceiling; lower it if your plan/host caps shorter.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "Processing cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await drainProcessingQueue();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
