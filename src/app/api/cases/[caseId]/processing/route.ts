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
import {
  getProcessingViewForOwner,
  resumeStalledProcessing,
  runCaseProcessing,
} from "@/services/case-processing-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { caseId } = await params;
  const view = await getProcessingViewForOwner(session.userId, caseId);
  if (!view) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (view.snapshot.state === "QUEUED") {
    after(() => runCaseProcessing(caseId));
  } else if (view.snapshot.state === "RUNNING" && view.snapshot.stalled) {
    // A live run heartbeats; a stalled one is DEAD (killed process). Re-queue
    // and resume it — checkpointed extraction means no work (and no paid AI
    // call) is ever repeated. Attempt-capped inside; atomic against races.
    after(async () => {
      if (await resumeStalledProcessing(caseId)) await runCaseProcessing(caseId);
    });
  }

  // Never cache: the dashboard needs the live state on every poll. The payload
  // is { ...snapshot, headline } so Stage-1 results render without a reload.
  return NextResponse.json(
    { ...view.snapshot, headline: view.headline },
    { headers: { "Cache-Control": "no-store" } },
  );
}
