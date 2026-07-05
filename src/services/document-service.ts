/**
 * Financial statement documents (wizard Step 3). Files are stored through
 * the storage adapter under server-generated keys; the client filename is
 * metadata only. Sprint 1 stores files — parsing is Sprint 4.
 */
import { MAX_STATEMENT_FILE_BYTES } from "@/lib/case-constants";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getOwnedCase } from "@/services/case-service";
import { recordAudit } from "@/services/audit-service";

import type { Document } from "@/generated/prisma/client";

type Result<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function isPdf(file: File, bytes: Buffer): boolean {
  return file.type === "application/pdf" && bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

export async function addFinancialStatement(
  userId: string,
  caseId: string,
  file: File,
  fiscalYear: number,
): Promise<Result<Document>> {
  const owned = await getOwnedCase(userId, caseId);
  if (!owned) return { ok: false, error: "Case not found." };
  if (owned.status !== "DRAFT") {
    return { ok: false, error: "Documents can only be changed while the case is a draft." };
  }
  if (file.size === 0) return { ok: false, error: "The selected file is empty." };
  if (file.size > MAX_STATEMENT_FILE_BYTES) {
    return { ok: false, error: "File is too large — the maximum size is 10 MB." };
  }
  if (
    owned.documents.some((d) => d.docType === "FINANCIAL_STATEMENT" && d.fiscalYear === fiscalYear)
  ) {
    return {
      ok: false,
      error: `A statement for ${fiscalYear} is already uploaded. Remove it first to replace it.`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isPdf(file, bytes)) {
    return { ok: false, error: "Only PDF files are accepted for audited financial statements." };
  }

  const storageKey = `cases/${caseId}/${crypto.randomUUID()}.pdf`;
  await storage.save(storageKey, bytes);

  const document = await prisma.document.create({
    data: {
      caseId,
      uploadedById: userId,
      fileName: file.name,
      storageKey,
      mimeType: "application/pdf",
      fileSize: file.size,
      docType: "FINANCIAL_STATEMENT",
      fiscalYear,
    },
  });

  await recordAudit({
    action: "document.uploaded",
    actorId: userId,
    caseId,
    detail: { documentId: document.id, fileName: file.name, fiscalYear },
  });
  return { ok: true, data: document };
}

export async function removeFinancialStatement(
  userId: string,
  documentId: string,
): Promise<Result> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return { ok: false, error: "Document not found." };

  const owned = await getOwnedCase(userId, document.caseId);
  if (!owned) return { ok: false, error: "Document not found." };
  if (owned.status !== "DRAFT") {
    return { ok: false, error: "Documents can only be changed while the case is a draft." };
  }

  await prisma.document.delete({ where: { id: documentId } });
  await storage.remove(document.storageKey).catch(() => {
    // DB row is gone; an orphaned file on disk is harmless.
  });

  await recordAudit({
    action: "document.removed",
    actorId: userId,
    caseId: document.caseId,
    detail: { documentId, fileName: document.fileName, fiscalYear: document.fiscalYear },
  });
  return { ok: true };
}

/** Ownership-checked read for the authenticated download route. */
export async function getDocumentContent(
  userId: string,
  documentId: string,
): Promise<{ document: Document; content: Buffer } | null> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return null;

  const owned = await getOwnedCase(userId, document.caseId);
  if (!owned) return null;

  const content = await storage.read(document.storageKey);
  return { document, content };
}
