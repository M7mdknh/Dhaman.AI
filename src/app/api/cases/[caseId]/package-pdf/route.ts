/**
 * Authenticated Underwriting Package download (bank-side). The complete case
 * file as a banking-grade PDF — rendered on demand at whatever workflow stage
 * the case is in (pre-decision stages print explicit placeholders). Access:
 * bank staff only (checked in officer-case-service, audited).
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getUnderwritingPackagePdf } from "@/services/officer-case-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { caseId } = await params;
  const result = await getUnderwritingPackagePdf(session.userId, caseId);
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
