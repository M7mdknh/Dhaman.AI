/**
 * Authenticated document download. Files are NEVER served from public
 * URLs — ownership is checked in document-service on every request.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getDocumentContent } from "@/services/document-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { documentId } = await params;
  const result = await getDocumentContent(session.userId, documentId);
  if (!result) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  // Sanitize the display filename for the header; it is metadata, not a path.
  const safeName = result.document.fileName.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(new Uint8Array(result.content), {
    headers: {
      "Content-Type": result.document.mimeType,
      "Content-Length": String(result.document.fileSize),
      "Content-Disposition": `inline; filename="${safeName}"`,
    },
  });
}
