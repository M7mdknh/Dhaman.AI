/**
 * IFRS extraction pipeline orchestration. Runs at case submission, BEFORE
 * the case leaves DRAFT: hard failures reject the submission so the
 * contractor can replace the offending file immediately.
 *
 * Persistence rules (deterministic, documented in docs/IFRS_ENGINE.md):
 *  - One DocumentExtraction row per document (latest run only).
 *  - FinancialStatement rows are rebuilt from scratch on every run:
 *    for fiscal year Y, the document labeled fiscalYear=Y wins; comparative
 *    columns from newer documents only fill years no document is labeled with.
 */
import { createHash } from "node:crypto";

import { extractIfrs, type IfrsExtraction } from "@/lib/ifrs/extract";
import { PdfReadError } from "@/lib/ifrs/types";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { recordAudit } from "@/services/audit-service";

import type { CanonicalKey } from "@/lib/ifrs/normalizer";
import type { ValidationIssue } from "@/lib/ifrs/types";
import type { Document, Prisma } from "@/generated/prisma/client";

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

/** Runs extraction for every financial statement on the case. */
export async function processCaseDocuments(
  caseId: string,
  actorId: string,
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

    try {
      const bytes = await storage.read(document.storageKey);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const extraction = await extractIfrs(bytes);
      const blocking = extraction.validation.errors;

      await persistExtraction(document.id, startedAt, extraction, null);
      await prisma.document.update({
        where: { id: document.id },
        data: { sha256, processingStatus: blocking.length ? "FAILED" : "COMPLETED" },
      });

      if (blocking.length > 0) {
        failures.push({
          documentId: document.id,
          fileName: document.fileName,
          fiscalYear: document.fiscalYear,
          message: blocking.map((e) => e.message).join(" "),
        });
      } else {
        completed.push({ document, extraction });
        warnings.push(
          ...extraction.validation.warnings.map((w) => ({
            ...w,
            message: `${document.fileName}: ${w.message}`,
          })),
        );
      }
    } catch (error) {
      const message =
        error instanceof PdfReadError
          ? error.message
          : "The document could not be processed. Please re-export the PDF and try again.";
      await persistExtraction(document.id, startedAt, null, message);
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "FAILED" },
      });
      failures.push({
        documentId: document.id,
        fileName: document.fileName,
        fiscalYear: document.fiscalYear,
        message,
      });
    }
  }

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
