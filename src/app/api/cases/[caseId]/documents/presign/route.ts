/**
 * Statement upload, step 1 (direct-to-storage path): validate the slot and
 * mint a short-lived presigned PUT URL so the browser sends the bytes
 * STRAIGHT to object storage. The app server never carries the file body,
 * which is what makes the advertised 10 MB limit real on hosts that cap
 * function request bodies at 4.5 MB (Vercel). `uploadUrl: null` tells the
 * client to fall back to the through-the-server multipart route (local dev).
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { presignStatementSchema } from "@/lib/validation/case";
import { prepareStatementUpload } from "@/services/document-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { caseId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = presignStatementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const result = await prepareStatementUpload(session.userId, caseId, parsed.data);
  console.log(
    "[upload]",
    JSON.stringify({
      stage: "presign",
      caseId,
      fileSize: parsed.data.fileSize,
      fiscalYear: parsed.data.fiscalYear,
      ok: result.ok,
      direct: result.ok ? result.data.uploadUrl !== null : null,
      durationMs: Date.now() - startedAt,
      error: result.ok ? undefined : result.error,
    }),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.data, { status: 200 });
}
