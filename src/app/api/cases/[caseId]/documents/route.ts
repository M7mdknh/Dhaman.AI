/**
 * Financial statement upload endpoint. A route handler (not a server
 * action) so the client can stream the file with real progress events.
 * All business validation lives in document-service.
 *
 * Two request shapes:
 *  - application/json  → FINALIZE of a direct-to-storage upload (the bytes
 *    are already in the bucket via the presigned PUT; this verifies them and
 *    registers the document).
 *  - multipart/form-data → through-the-server upload (local dev, and the
 *    automatic fallback when direct upload is unavailable). NOTE: on hosts
 *    that cap function request bodies (Vercel: 4.5 MB) this path cannot carry
 *    a full-size statement — the direct path exists precisely for that.
 *
 * Every request logs a single structured [upload] line with per-stage
 * durations so a failing upload is diagnosable from the logs alone.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { finalizeStatementSchema, statementYearSchema } from "@/lib/validation/case";
import { addFinancialStatement, finalizeStatementUpload } from "@/services/document-service";

import type { Document } from "@/generated/prisma/client";

function documentPayload(d: Document) {
  const { id, fileName, fileSize, fiscalYear, processingStatus, createdAt } = d;
  return { id, fileName, fileSize, fiscalYear, processingStatus, createdAt };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const startedAt = Date.now();
  const stages: Record<string, number> = {};
  let last = startedAt;
  const mark = (stage: string) => {
    const now = Date.now();
    stages[stage] = now - last;
    last = now;
  };
  const logOutcome = (
    mode: "finalize" | "multipart",
    extra: Record<string, unknown>,
  ) =>
    console.log(
      "[upload]",
      JSON.stringify({ stage: "register", mode, ...extra, stages, totalMs: Date.now() - startedAt }),
    );

  const session = await getSession();
  mark("auth");
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { caseId } = await params;
  const contentType = request.headers.get("content-type") ?? "";

  // ---- Direct-upload finalize (JSON): verify the object already in storage.
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const parsed = finalizeStatementSchema.safeParse(body);
    mark("parse");
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
    }
    let result;
    try {
      result = await finalizeStatementUpload(session.userId, caseId, parsed.data);
    } catch (error) {
      console.error("Statement finalize failed", { caseId, error });
      logOutcome("finalize", { caseId, ok: false, error: "exception" });
      return NextResponse.json(
        { error: "The upload could not be verified. Please try again." },
        { status: 500 },
      );
    }
    mark("verifyAndRegister");
    logOutcome("finalize", { caseId, ok: result.ok, ...(result.ok ? { documentId: result.data.id, fileSize: result.data.fileSize } : { error: result.error }) });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ document: documentPayload(result.data) }, { status: 201 });
  }

  // ---- Through-the-server upload (multipart).
  // Next truncates buffered request bodies at the configured cap, which makes
  // oversized multipart payloads unparseable — surface that cleanly.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload could not be read — the maximum file size is 10 MB." },
      { status: 400 },
    );
  }
  mark("parse");
  const file = formData.get("file");
  const year = statementYearSchema.safeParse(formData.get("fiscalYear"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!year.success) {
    return NextResponse.json({ error: "Invalid fiscal year." }, { status: 400 });
  }

  let result;
  try {
    result = await addFinancialStatement(session.userId, caseId, file, year.data);
  } catch (error) {
    // An unexpected failure (storage backend, database) must not leak as an
    // opaque 500 — the client can only surface a clean JSON error. Log the
    // cause server-side so it stays diagnosable.
    console.error("Financial statement upload failed", { caseId, error });
    logOutcome("multipart", { caseId, fileSize: file.size, ok: false, error: "exception" });
    return NextResponse.json(
      { error: "Upload could not be saved. Please try again." },
      { status: 500 },
    );
  }
  mark("validateAndSave");
  logOutcome("multipart", { caseId, fileSize: file.size, ok: result.ok, ...(result.ok ? { documentId: result.data.id } : { error: result.error }) });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ document: documentPayload(result.data) }, { status: 201 });
}
