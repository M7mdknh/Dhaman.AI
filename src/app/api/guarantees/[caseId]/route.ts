/**
 * Authenticated Letter of Guarantee download. The PDF is rendered on demand
 * from the guarantee row — never stored, never public. Access: bank staff
 * or the owning contractor company (checked in guarantee-service, audited).
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getGuaranteePdf } from "@/services/guarantee-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { caseId } = await params;
  const result = await getGuaranteePdf(session.userId, caseId);
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
