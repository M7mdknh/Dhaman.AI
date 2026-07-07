/**
 * Processing status endpoint. A route handler (not a server action) so the
 * case-page dashboard can lightweight-poll the live pipeline progress.
 *
 * It is also the pipeline's self-heal: if the job is still QUEUED (e.g. the
 * `after()` trigger from submission was lost to a restart), the first poll
 * re-triggers `runCaseProcessing`. The run is self-claiming, so this can never
 * cause a double run.
 */
import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getProcessingForOwner, runCaseProcessing } from "@/services/case-processing-service";

// The self-heal below can kick off the pipeline out-of-band via `after()`;
// give that work real headroom (the scheduled cron is the durable backstop).
export const maxDuration = 300;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { caseId } = await params;
  const snapshot = await getProcessingForOwner(session.userId, caseId);
  if (!snapshot) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (snapshot.state === "QUEUED") {
    after(() => runCaseProcessing(caseId));
  }

  // Never cache: the dashboard needs the live state on every poll.
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
