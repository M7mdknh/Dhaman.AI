/**
 * Workflow sync endpoint. Lightweight poll target for the WorkflowSync
 * client component: returns an opaque token that changes whenever the
 * caller-visible workflow state changes (one case with `?caseId=`, the whole
 * dashboard without). The client compares tokens and refreshes the page the
 * moment they differ — every role converges on the same case state without
 * manual reloads.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getCaseSyncToken, getWorkbenchSyncToken } from "@/services/workflow-sync-service";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const caseId = request.nextUrl.searchParams.get("caseId");
  const token = caseId
    ? await getCaseSyncToken(session.userId, caseId)
    : await getWorkbenchSyncToken(session.userId);
  if (token === null) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
