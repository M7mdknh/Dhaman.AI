/**
 * Financial statement upload endpoint. A route handler (not a server
 * action) so the client can stream the file with real progress events.
 * All business validation lives in document-service.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { statementYearSchema } from "@/lib/validation/case";
import { addFinancialStatement } from "@/services/document-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { caseId } = await params;
  // Next truncates request bodies at 10 MB, which makes oversized multipart
  // payloads unparseable — surface that as a clean validation error.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload could not be read — the maximum file size is 10 MB." },
      { status: 400 },
    );
  }
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
    return NextResponse.json(
      { error: "Upload could not be saved. Please try again." },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { id, fileName, fileSize, fiscalYear, processingStatus, createdAt } = result.data;
  return NextResponse.json(
    { document: { id, fileName, fileSize, fiscalYear, processingStatus, createdAt } },
    { status: 201 },
  );
}
