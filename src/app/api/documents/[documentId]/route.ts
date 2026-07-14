/**
 * Authenticated document download. Files are NEVER served from public
 * URLs — ownership is checked in document-service on every request.
 *
 * After the access check (and audit), the bytes are served via a short-lived
 * presigned storage URL when the backend supports it: hosts that cap function
 * RESPONSE bodies (Vercel: 4.5 MB) cannot stream a full-size annual report
 * through the server. Local disk falls back to streaming.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { storage } from "@/lib/storage";
import { getDocumentForDownload } from "@/services/document-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { documentId } = await params;
  const document = await getDocumentForDownload(session.userId, documentId);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  // Direct-from-storage: the URL is single-object, 60-second, and minted only
  // AFTER the access check above — the bucket itself stays private.
  const signed = await storage.presignGet(document.storageKey, document.fileName);
  if (signed) {
    return NextResponse.redirect(signed, 307);
  }

  // Local disk: stream through the server (no body caps apply here).
  const content = await storage.read(document.storageKey);
  // Sanitize the display filename for the header; it is metadata, not a path.
  const safeName = document.fileName.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(document.fileSize),
      "Content-Disposition": `inline; filename="${safeName}"`,
    },
  });
}
