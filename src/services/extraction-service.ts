/**
 * IFRS extraction pipeline orchestration. Runs inside the async processing
 * job (case-processing-service), never in the submission request — the case
 * is already SAVED and PROCESSING before any document is read. A hard failure
 * here leaves the case + documents intact and the job retryable (no re-upload);
 * it never rolls back the submission. Stage progress is reported to the caller
 * via `onStage` so the live dashboard can advance.
 *
 * Persistence rules (deterministic, documented in docs/IFRS_ENGINE.md):
 *  - One DocumentExtraction row per document (latest run only).
 *  - FinancialStatement rows are rebuilt from scratch on every run:
 *    for fiscal year Y, the document labeled fiscalYear=Y wins; comparative
 *    columns from newer documents only fill years no document is labeled with.
 */
import { createHash } from "node:crypto";

import { extractIfrs, type IfrsExtraction } from "@/lib/ifrs/extract";
import { terminateOcr } from "@/lib/ifrs/ocr";
import { PdfReadError } from "@/lib/ifrs/types";
import { prisma } from "@/lib/prisma";
import { storage, StorageError } from "@/lib/storage";
import { recordAudit } from "@/services/audit-service";

import type { CanonicalKey } from "@/lib/ifrs/normalizer";
import type { ValidationIssue } from "@/lib/ifrs/types";
import type { Document, Prisma } from "@/generated/prisma/client";
import type { ProcessingStage } from "@/generated/prisma/enums";

/**
 * Reports pipeline progress to the caller (the processing orchestrator) so it
 * can persist the live stage. Reports may repeat or arrive out of order across
 * documents; the caller advances the dashboard monotonically.
 */
export type StageReporter = (stage: ProcessingStage) => Promise<void>;

export interface DocumentFailure {
  documentId: string;
  fileName: string;
  fiscalYear: number | null;
  message: string;
}

export interface PipelineOutcome {
  ok: boolean;
  /** Fiscal years persisted as FinancialStatement rows. */
  years: number[];
  failures: DocumentFailure[];
  warnings: ValidationIssue[];
}

interface CompletedExtraction {
  document: Document;
  extraction: IfrsExtraction;
}

/** Grep-able, single-line structured log for each pipeline stage. */
function logStage(
  stage: string,
  documentId: string,
  startedAt: Date,
  extra: Record<string, unknown> = {},
): void {
  console.log(
    "[ifrs-extraction]",
    JSON.stringify({ stage, documentId, elapsedMs: Date.now() - startedAt.getTime(), ...extra }),
  );
}

type FailureKind = "document" | "storage" | "unexpected";

/**
 * Turns any thrown error into (a) an honest, user-facing message and (b) a
 * technical detail for the logs. Only genuine document faults ask the user to
 * fix their file; storage/unexpected faults are ours, not theirs.
 */
function classifyFailure(error: unknown): {
  kind: FailureKind;
  userMessage: string;
  detail: string;
} {
  if (error instanceof PdfReadError) {
    return { kind: "document", userMessage: error.message, detail: `${error.name}[${error.code}]: ${error.message}` };
  }
  if (error instanceof StorageError) {
    return {
      kind: "storage",
      userMessage:
        "A system error prevented processing this document. Please try again in a moment; if the problem persists, contact support.",
      detail: `${error.message} — cause: ${describeCause(error.cause)}`,
    };
  }
  return {
    kind: "unexpected",
    userMessage:
      "The document could not be processed due to an unexpected error. Our team has been notified.",
    detail: describeCause(error),
  };
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    const code = (cause as { code?: string; Code?: string }).code ?? (cause as { Code?: string }).Code;
    return `${cause.name}${code ? `[${code}]` : ""}: ${cause.message}`;
  }
  return String(cause);
}

/** Runs extraction for every financial statement on the case. */
export async function processCaseDocuments(
  caseId: string,
  actorId: string | null,
  onStage?: StageReporter,
): Promise<PipelineOutcome> {
  const documents = await prisma.document.findMany({
    where: { caseId, docType: "FINANCIAL_STATEMENT" },
    orderBy: { fiscalYear: "desc" },
  });

  const completed: CompletedExtraction[] = [];
  const failures: DocumentFailure[] = [];
  const warnings: ValidationIssue[] = [];

  for (const document of documents) {
    await prisma.document.update({
      where: { id: document.id },
      data: { processingStatus: "PROCESSING" },
    });
    const startedAt = new Date();
    logStage("start", document.id, startedAt, { fileName: document.fileName, fiscalYear: document.fiscalYear });

    try {
      await onStage?.("READING_STATEMENTS");
      const bytes = await storage.read(document.storageKey);
      logStage("storage_read", document.id, startedAt, { bytes: bytes.length });

      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await onStage?.("DETECTING_STATEMENTS");
      const extraction = await extractIfrs(bytes, { enableOcr: true });
      await onStage?.("EXTRACTING_DATA");
      const blocking = extraction.validation.errors;
      logStage("extracted", document.id, startedAt, {
        textSource: extraction.meta.textSource,
        ocrPages: extraction.meta.ocrPages.length,
        ocrConfidence: extraction.meta.ocrConfidence,
        valuesTrusted: extraction.meta.valuesTrusted,
        statements: extraction.result.statements.map((s) => s.type),
        fiscalYears: extraction.result.fiscalYears,
        blockingErrors: blocking.map((e) => e.code),
        warnings: extraction.validation.warnings.length,
      });

      await persistExtraction(document.id, startedAt, extraction, null);
      await prisma.document.update({
        where: { id: document.id },
        data: { sha256, processingStatus: blocking.length ? "FAILED" : "COMPLETED" },
      });

      if (blocking.length > 0) {
        logStage("failed_validation", document.id, startedAt, {
          errors: blocking.map((e) => e.code),
        });
        failures.push({
          documentId: document.id,
          fileName: document.fileName,
          fiscalYear: document.fiscalYear,
          message: blocking.map((e) => e.message).join(" "),
        });
      } else {
        logStage("completed", document.id, startedAt);
        completed.push({ document, extraction });
        warnings.push(
          ...extraction.validation.warnings.map((w) => ({
            ...w,
            message: `${document.fileName}: ${w.message}`,
          })),
        );
      }
    } catch (error) {
      const { kind, userMessage, detail } = classifyFailure(error);
      // The real exception lives here, in the logs — never lost behind the
      // user-facing message the way it was before.
      console.error(
        "[ifrs-extraction]",
        JSON.stringify({
          stage: "error",
          documentId: document.id,
          fileName: document.fileName,
          storageKey: document.storageKey,
          kind,
          elapsedMs: Date.now() - startedAt.getTime(),
          detail,
        }),
      );
      await persistExtraction(document.id, startedAt, null, userMessage);
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "FAILED" },
      });
      failures.push({
        documentId: document.id,
        fileName: document.fileName,
        fiscalYear: document.fiscalYear,
        message: userMessage,
      });
    }
  }

  // Release the shared OCR worker; a failure here must not fail the pipeline.
  await terminateOcr().catch(() => {});

  const years = failures.length === 0 ? await rebuildFinancialStatements(caseId, completed) : [];

  await recordAudit({
    action: failures.length ? "case.extraction_failed" : "case.extraction_completed",
    actorId,
    caseId,
    detail: {
      documents: documents.length,
      years,
      failures: failures.map((f) => ({ fileName: f.fileName, message: f.message })),
      warnings: warnings.length,
    },
  });

  return { ok: failures.length === 0 && years.length > 0, years, failures, warnings };
}

async function persistExtraction(
  documentId: string,
  startedAt: Date,
  extraction: IfrsExtraction | null,
  error: string | null,
): Promise<void> {
  const completedAt = new Date();
  const base = {
    parserName: "daman-ifrs-ts/1",
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    currency: extraction?.result.currency ?? null,
    scale: extraction?.result.scale ?? 1,
    fiscalYears: extraction?.result.fiscalYears ?? [],
    detectedStatements: extraction?.result.statements.map((s) => s.type) ?? [],
    companyName: extraction?.result.companyName ?? null,
    raw: extraction
      ? ({ lineItems: extraction.result.lineItems } as unknown as Prisma.InputJsonValue)
      : undefined,
    validation: extraction
      ? (extraction.validation as unknown as Prisma.InputJsonValue)
      : undefined,
    error,
  };
  await prisma.documentExtraction.upsert({
    where: { documentId },
    create: { documentId, ...base },
    update: base,
  });
}

/**
 * Rebuilds the case's FinancialStatement rows from the completed
 * extractions. Delete-then-create keeps re-runs idempotent.
 */
async function rebuildFinancialStatements(
  caseId: string,
  completed: CompletedExtraction[],
): Promise<number[]> {
  // Year → source: labeled document first, then newest document that saw it.
  const sources = new Map<number, CompletedExtraction>();
  for (const entry of completed) {
    for (const year of entry.extraction.figures.keys()) {
      const current = sources.get(year);
      const labeled = entry.document.fiscalYear === year;
      const currentLabeled = current?.document.fiscalYear === year;
      if (!current || (labeled && !currentLabeled)) sources.set(year, entry);
    }
  }

  const rows = [...sources.entries()].map(([fiscalYear, { document, extraction }]) => {
    const figures = extraction.figures.get(fiscalYear)!;
    return {
      caseId,
      documentId: document.id,
      fiscalYear,
      currency: extraction.result.currency ?? "SAR",
      audited: true,
      sourceJson: {
        documentId: document.id,
        fileName: document.fileName,
        scale: extraction.result.scale,
        extractedAt: new Date().toISOString(),
        parserName: "daman-ifrs-ts/1",
      },
      ...toDecimalColumns(figures),
    };
  });

  await prisma.$transaction([
    prisma.financialStatement.deleteMany({ where: { caseId } }),
    prisma.financialStatement.createMany({ data: rows }),
  ]);

  return [...sources.keys()].sort((a, b) => b - a);
}

/** Decimal columns accept the normalized decimal strings verbatim. */
function toDecimalColumns(
  figures: Partial<Record<CanonicalKey, string>>,
): Partial<Record<CanonicalKey, string>> {
  const columns: Partial<Record<CanonicalKey, string>> = {};
  for (const [key, value] of Object.entries(figures)) {
    if (value !== undefined) columns[key as CanonicalKey] = value;
  }
  return columns;
}
