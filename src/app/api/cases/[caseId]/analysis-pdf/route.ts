/**
 * Authenticated Financial Intelligence Report download (bank-side). The PDF
 * is rendered on demand from the deterministic engine's output — never
 * stored, never public. Access: bank staff only (checked in
 * officer-case-service, audited).
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getFinancialAnalysisPdf } from "@/services/officer-case-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { caseId } = await params;
  const result = await getFinancialAnalysisPdf(session.userId, caseId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return new NextResponse(Buffer.from(result.data.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.data.fileName}"`,
    },
  });
}
