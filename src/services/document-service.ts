/**
 * Financial statement documents (wizard Step 3). Files are stored through
 * the storage adapter under server-generated keys; the client filename is
 * metadata only. Uploading only STORES the file; extraction/parsing happens
 * later in the async processing job, after the case is submitted.
 */
import { looksLikePdf, MAX_STATEMENT_FILE_BYTES } from "@/lib/case-constants";
import { prisma } from "@/lib/prisma";
import { storage, StorageError } from "@/lib/storage";
import { getOwnedCase } from "@/services/case-service";
import { recordAudit } from "@/services/audit-service";

import type { Document } from "@/generated/prisma/client";
import type { StatementType } from "@/generated/prisma/enums";

type Result<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

/** The authoritative content check: the `%PDF-` header. Real-world reports
 * occasionally carry a few junk bytes before it (bad exporters), and PDF
 * readers tolerate the header anywhere in the first 1024 bytes — so do we. */
function hasPdfMagic(bytes: Buffer): boolean {
  return bytes.subarray(0, 1024).toString("latin1").includes("%PDF-");
}

/**
 * Shared pre-flight for every statement upload path: ownership, draft state,
 * size bounds, and the one-statement-per-year rule. Returns the owned case on
 * success so callers do not re-read it.
 */
async function validateStatementSlot(
  userId: string,
  caseId: string,
  fiscalYear: number,
  fileSize: number,
): Promise<Result<NonNullable<Awaited<ReturnType<typeof getOwnedCase>>>>> {
  const owned = await getOwnedCase(userId, caseId);
  if (!owned) return { ok: false, error: "Case not found." };
  if (owned.status !== "DRAFT") {
    return { ok: false, error: "Documents can only be changed while the case is a draft." };
  }
  if (fileSize === 0) return { ok: false, error: "The selected file is empty." };
  if (fileSize > MAX_STATEMENT_FILE_BYTES) {
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
  return { ok: true, data: owned };
}

/** Creates the Document row + audit for a statement whose bytes are already
 * in storage under `storageKey`. */
async function createStatementRecord(
  userId: string,
  caseId: string,
  storageKey: string,
  fileName: string,
  fileSize: number,
  fiscalYear: number,
  statementType: StatementType,
): Promise<Document> {
  const document = await prisma.document.create({
    data: {
      caseId,
      uploadedById: userId,
      fileName,
      storageKey,
      mimeType: "application/pdf",
      fileSize,
      docType: "FINANCIAL_STATEMENT",
      fiscalYear,
      statementType,
    },
  });
  await recordAudit({
    action: "document.uploaded",
    actorId: userId,
    caseId,
    detail: { documentId: document.id, fileName, fiscalYear, statementType },
  });
  return document;
}

/**
 * Pre-flight for the signed contract / award letter upload (wizard Step 3).
 * One contract document per case — replacing means removing the old one
 * first, exactly like the per-year statement rule.
 */
async function validateContractSlot(
  userId: string,
  caseId: string,
  fileSize: number,
): Promise<Result<NonNullable<Awaited<ReturnType<typeof getOwnedCase>>>>> {
  const owned = await getOwnedCase(userId, caseId);
  if (!owned) return { ok: false, error: "Case not found." };
  if (owned.status !== "DRAFT") {
    return { ok: false, error: "Documents can only be changed while the case is a draft." };
  }
  if (fileSize === 0) return { ok: false, error: "The selected file is empty." };
  if (fileSize > MAX_STATEMENT_FILE_BYTES) {
    return { ok: false, error: "File is too large — the maximum size is 10 MB." };
  }
  if (owned.documents.some((d) => d.docType === "CONTRACT")) {
    return {
      ok: false,
      error: "A contract document is already uploaded. Remove it first to replace it.",
    };
  }
  return { ok: true, data: owned };
}

/**
 * Through-the-server upload of the signed contract / award letter (PDF).
 * Upload only — no authenticity verification in this phase; the document is
 * evidence for the reviewing officer.
 */
export async function addContractDocument(
  userId: string,
  caseId: string,
  file: File,
): Promise<Result<Document>> {
  const slot = await validateContractSlot(userId, caseId, file.size);
  if (!slot.ok) return slot;

  if (!looksLikePdf(file.name, file.type)) {
    return { ok: false, error: "Only PDF files are accepted for the contract document." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasPdfMagic(bytes)) {
    return {
      ok: false,
      error: "This file does not appear to be a valid PDF. Please upload the contract as a PDF.",
    };
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
      docType: "CONTRACT",
    },
  });
  await recordAudit({
    action: "document.uploaded",
    actorId: userId,
    caseId,
    detail: { documentId: document.id, fileName: file.name, docType: "CONTRACT" },
  });
  return { ok: true, data: document };
}

/** Through-the-server upload (multipart). Used in local development and as
 * the automatic fallback when the direct-to-storage path is unavailable. */
export async function addFinancialStatement(
  userId: string,
  caseId: string,
  file: File,
  fiscalYear: number,
  statementType: StatementType = "AUDITED",
): Promise<Result<Document>> {
  const slot = await validateStatementSlot(userId, caseId, fiscalYear, file.size);
  if (!slot.ok) return slot;

  if (!looksLikePdf(file.name, file.type)) {
    return { ok: false, error: "Only PDF files are accepted for audited financial statements." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasPdfMagic(bytes)) {
    return {
      ok: false,
      error: "This file does not appear to be a valid PDF. Please upload the audited statement as a PDF.",
    };
  }

  const storageKey = `cases/${caseId}/${crypto.randomUUID()}.pdf`;
  await storage.save(storageKey, bytes);
  const document = await createStatementRecord(
    userId, caseId, storageKey, file.name, file.size, fiscalYear, statementType,
  );
  return { ok: true, data: document };
}

/**
 * Step 1 of the DIRECT upload path: validate everything validatable before a
 * byte moves, then mint a short-lived presigned PUT URL. `uploadUrl: null`
 * means the storage backend cannot presign (local disk) — the client falls
 * back to the multipart route. The bytes travel browser → storage directly,
 * which is what lifts uploads above the host's request-body cap (Vercel:
 * 4.5 MB — the advertised 10 MB limit is impossible through the server there).
 */
export async function prepareStatementUpload(
  userId: string,
  caseId: string,
  input: { fileName: string; fileSize: number; fileType: string; fiscalYear: number },
): Promise<Result<{ uploadUrl: string | null; storageKey: string }>> {
  const slot = await validateStatementSlot(userId, caseId, input.fiscalYear, input.fileSize);
  if (!slot.ok) return slot;
  if (!looksLikePdf(input.fileName, input.fileType)) {
    return { ok: false, error: "Only PDF files are accepted for audited financial statements." };
  }

  const storageKey = `cases/${caseId}/${crypto.randomUUID()}.pdf`;
  const uploadUrl = await storage.presignPut(storageKey, "application/pdf");
  return { ok: true, data: { uploadUrl, storageKey } };
}

/**
 * Step 2 of the DIRECT upload path: after the browser PUT the object, verify
 * the bytes that actually landed (size bounds + PDF header — the server never
 * trusts the client's claims) and only then create the Document row. An
 * object that fails verification is deleted so nothing unaccounted lingers
 * in the bucket.
 */
export async function finalizeStatementUpload(
  userId: string,
  caseId: string,
  input: { storageKey: string; fileName: string; fiscalYear: number; statementType: StatementType },
): Promise<Result<Document>> {
  // The key must be one WE minted for THIS case — never a caller-shaped path.
  // caseId is matched as a LITERAL string prefix (never compiled into a regex,
  // so a caseId carrying regex metacharacters cannot throw or alter the match);
  // only the constant UUID + ".pdf" tail is checked by a fixed pattern.
  const prefix = `cases/${caseId}/`;
  const suffix = input.storageKey.startsWith(prefix)
    ? input.storageKey.slice(prefix.length)
    : null;
  if (suffix === null || !/^[0-9a-f-]{36}\.pdf$/.test(suffix)) {
    return { ok: false, error: "Upload reference not recognized. Please try the upload again." };
  }
  // Idempotency/hijack guard: a key already registered can never be reused.
  const existing = await prisma.document.findUnique({ where: { storageKey: input.storageKey } });
  if (existing) return { ok: false, error: "This upload was already registered." };

  let bytes: Buffer;
  try {
    bytes = await storage.read(input.storageKey);
  } catch (error) {
    if (error instanceof StorageError) {
      return {
        ok: false,
        error: "The uploaded file did not reach storage. Please try the upload again.",
      };
    }
    throw error;
  }

  const slot = await validateStatementSlot(userId, caseId, input.fiscalYear, bytes.length);
  if (!slot.ok) {
    await storage.remove(input.storageKey).catch(() => {});
    return slot;
  }
  if (!hasPdfMagic(bytes)) {
    await storage.remove(input.storageKey).catch(() => {});
    return {
      ok: false,
      error: "This file does not appear to be a valid PDF. Please upload the audited statement as a PDF.",
    };
  }

  const document = await createStatementRecord(
    userId, caseId, input.storageKey, input.fileName, bytes.length, input.fiscalYear,
    input.statementType,
  );
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

/**
 * Access check (+ audit) for the authenticated download route: contractors
 * are ownership-scoped; bank staff read any post-submission document and
 * every such access is audited. Returns the document WITHOUT its content —
 * the route then serves the bytes via a presigned URL (direct from storage,
 * immune to the host's response-body cap) or a stream (local disk).
 */
export async function getDocumentForDownload(
  userId: string,
  documentId: string,
): Promise<Document | null> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return null;

  if (
    user.role === "RELATIONSHIP_MANAGER" ||
    user.role === "RISK_OFFICER" ||
    user.role === "ADMIN"
  ) {
    const reviewable = await prisma.underwritingCase.findFirst({
      where: { id: document.caseId, status: { not: "DRAFT" } },
      select: { id: true },
    });
    if (!reviewable) return null;
    await recordAudit({
      action: "officer.document_downloaded",
      actorId: userId,
      caseId: document.caseId,
      detail: { documentId: document.id, fileName: document.fileName },
    });
  } else {
    const owned = await getOwnedCase(userId, document.caseId);
    if (!owned) return null;
  }

  return document;
}

/** Access-checked read (see getDocumentForDownload) including the content. */
export async function getDocumentContent(
  userId: string,
  documentId: string,
): Promise<{ document: Document; content: Buffer } | null> {
  const document = await getDocumentForDownload(userId, documentId);
  if (!document) return null;
  const content = await storage.read(document.storageKey);
  return { document, content };
}
