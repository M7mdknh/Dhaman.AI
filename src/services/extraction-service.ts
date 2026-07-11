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

import { env } from "@/lib/env";
import { extractIfrs, type IfrsExtraction } from "@/lib/ifrs/extract";
import {
  coreFigureCoverage,
  figuresByYear,
  type CanonicalKey,
  type FiguresByYear,
} from "@/lib/ifrs/normalizer";
import { terminateOcr } from "@/lib/ifrs/ocr";
import { formatPerfReport, StageTimer, STAGE, type PerfReport } from "@/lib/ifrs/perf";
import { PdfReadError } from "@/lib/ifrs/types";
import { prisma } from "@/lib/prisma";
import { storage, StorageError } from "@/lib/storage";
import { recordAudit } from "@/services/audit-service";
import { extractViaVision } from "@/services/extraction/vision-extractor";

import type { ExtractedLineItem, ValidationIssue, ValidationOutcome } from "@/lib/ifrs/types";
import type {
  Document,
  DocumentExtraction,
  FinancialStatement,
  Prisma,
} from "@/generated/prisma/client";
import type { ProcessingStage } from "@/generated/prisma/enums";

/** Documents processed concurrently. A case has ≤3 statements; OCR contention
 * is bounded independently by the OCR worker pool (env.OCR_CONCURRENCY). */
const DOCUMENT_CONCURRENCY = 3;

/** A document with its (optionally pre-loaded) latest extraction row. Loading
 * the extraction alongside the document in ONE query removes a per-document
 * round-trip from the ~175ms-each remote-DB critical path (the cache check). */
type DocumentWithExtraction = Document & { extraction: DocumentExtraction | null };

/** Core figures (of 8) the fast text pass must yield to be trusted as-is;
 * below this the document is treated as scanned/damaged → GPT-Vision. */
const VISION_MIN_CORE = 5;

/**
 * Reports pipeline progress to the caller (the processing orchestrator) so it
 * can persist the live stage. Reports may repeat or arrive out of order across
 * documents; the caller advances the dashboard monotonically. The optional
 * note explains a long wait inside a stage (e.g. AI vision on scanned pages).
 */
export type StageReporter = (stage: ProcessingStage, note?: string) => Promise<void>;

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
  /** The persisted FinancialStatement rows — returned so the caller can run
   * financial analysis without a second DB read of what we just wrote. */
  statements: FinancialStatement[];
  failures: DocumentFailure[];
  warnings: ValidationIssue[];
  /** Aggregate stage timing across all documents (for the performance report). */
  perf: PerfReport;
  /** Non-critical persistence (per-document extraction rows, doc status, the
   * extraction audit) that was moved OFF the Stage-1 critical path. The caller
   * awaits these before closing the job, so nothing is lost — but the "results
   * in seconds" flip never waits on them. */
  deferred: Promise<unknown>[];
}

/**
 * The minimum a completed document contributes downstream — sourced either from
 * a fresh extraction or reconstructed from a cached one. `rebuildFinancialStatements`
 * needs only figures + currency + scale, so we keep this narrow.
 */
interface CompletedExtraction {
  document: Document;
  figures: FiguresByYear;
  currency: string | null;
  scale: number;
  warnings: ValidationIssue[];
}

/** Per-document result of the concurrent map, reduced into the outcome. */
type DocumentResult =
  | { ok: true; completed: CompletedExtraction; perf: PerfReport | null }
  | { ok: false; failure: DocumentFailure; perf: PerfReport | null };

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

/**
 * Runs extraction for the case's financial statements, concurrently.
 *
 * `mode` controls document SCOPE only (the engines are identical either way):
 *  - "express" (default): only the LATEST audited statement is read. It usually
 *    carries a comparative column, so the engine still sees ≥2 years — but the
 *    critical path never waits on older uploads. Fastest believable assessment.
 *  - "comprehensive": every uploaded statement is read for full history.
 *
 * Non-critical writes (per-document extraction rows, document status, the audit)
 * are collected into `deferred` and returned unawaited — the caller flips the
 * case to ANALYSIS_READY first, then settles them before closing the job.
 */
export async function processCaseDocuments(
  caseId: string,
  actorId: string | null,
  onStage?: StageReporter,
  mode: "express" | "comprehensive" = env.UNDERWRITING_MODE,
): Promise<PipelineOutcome> {
  const all = await prisma.document.findMany({
    where: { caseId, docType: "FINANCIAL_STATEMENT" },
    orderBy: { fiscalYear: "desc" },
    // Load the latest extraction alongside each document so the cache check
    // costs no extra round-trip.
    include: { extraction: true },
  });
  // Express: read only the newest statement (fiscalYear desc → index 0). It
  // typically includes a prior-year comparative, so the engine still trends.
  const documents = mode === "express" && all.length > 0 ? all.slice(0, 1) : all;

  // A case-level timer aggregates every document's stage breakdown into one
  // performance report (requirement: measure every stage). `record`/`absorb`
  // are synchronous, so interleaving from concurrent documents is safe.
  const timer = new StageTimer();
  // Deferred (off-critical-path) writes, awaited by the caller before COMPLETED.
  const deferred: Promise<unknown>[] = [];

  const results = await mapWithConcurrency(documents, DOCUMENT_CONCURRENCY, (document) =>
    processDocument(document, timer, onStage, mode),
  );

  // Release the shared OCR workers; a failure here must not fail the pipeline.
  await terminateOcr().catch(() => {});

  const completed: CompletedExtraction[] = [];
  const failures: DocumentFailure[] = [];
  const warnings: ValidationIssue[] = [];
  for (const result of results) {
    if (result.perf) timer.absorb(result.perf);
    if (result.ok) {
      completed.push(result.completed);
      warnings.push(...result.completed.warnings);
    } else {
      failures.push(result.failure);
    }
  }

  const statements =
    failures.length === 0 ? await rebuildFinancialStatements(caseId, completed) : [];
  const years = statements.map((s) => s.fiscalYear).sort((a, b) => b - a);

  const perf = timer.report();
  console.log("[ifrs-extraction]", formatPerfReport(perf, `case ${caseId} extraction`));

  // The extraction audit is provenance, not correctness — defer it off the path.
  deferred.push(
    recordAudit({
      action: failures.length ? "case.extraction_failed" : "case.extraction_completed",
      actorId,
      caseId,
      detail: {
        mode,
        documents: documents.length,
        years,
        failures: failures.map((f) => ({ fileName: f.fileName, message: f.message })),
        warnings: warnings.length,
        perfMs: perf.wallMs,
      },
    }),
  );

  return {
    ok: failures.length === 0 && years.length > 0,
    years,
    statements,
    failures,
    warnings,
    perf,
    deferred,
  };
}

/**
 * Extracts a single document. Reuses a cached extraction when the SAME bytes
 * already completed successfully (retry after a sibling document failed → the
 * good documents are not re-read or re-OCR'd). Never throws: every fault is
 * captured as a DocumentResult so one bad file cannot abort the whole map.
 */
async function processDocument(
  document: DocumentWithExtraction,
  timer: StageTimer,
  onStage?: StageReporter,
  mode: "express" | "comprehensive" = env.UNDERWRITING_MODE,
): Promise<DocumentResult> {
  const startedAt = new Date();
  logStage("start", document.id, startedAt, { fileName: document.fileName, fiscalYear: document.fiscalYear });

  try {
    // RESUME CHECKPOINT: a document that already completed extraction is never
    // reworked — not re-read from storage, not re-parsed, and above all never
    // re-sent to GPT-Vision. Documents are immutable after submission (uploads
    // are draft-only), so the persisted extraction row IS the document's result.
    const resumed = reuseCachedExtraction(document, document.sha256);
    if (resumed) {
      await onStage?.("EXTRACTING_DATA");
      logStage("resume_checkpoint", document.id, startedAt, {
        years: [...resumed.figures.keys()],
      });
      return { ok: true, completed: resumed, perf: null };
    }

    await onStage?.("READING_STATEMENTS");
    const bytes = await timer.time(STAGE.STORAGE_READ, () => storage.read(document.storageKey));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    logStage("storage_read", document.id, startedAt, { bytes: bytes.length });

    // Cache: identical bytes that already completed successfully need no rework
    // (covers a legacy row whose sha was recorded by an older run).
    const cached = reuseCachedExtraction(document, sha256);
    if (cached) {
      await onStage?.("EXTRACTING_DATA");
      logStage("cache_hit", document.id, startedAt, { years: [...cached.figures.keys()] });
      return { ok: true, completed: cached, perf: null };
    }

    await onStage?.("DETECTING_STATEMENTS");
    // HYBRID extraction. 1) Fast text-only pass — MuPDF locates the statement
    // pages on the text layer; for a digital PDF this is the whole story (no
    // network, ~1s). 2) If it yields too few core figures the document is
    // scanned/damaged → GPT-Vision reads ONLY the statement-page images (≤5).
    // 3) The OCR fallback is COMPREHENSIVE-ONLY: tesseract on Arabic statement
    // tables runs minutes per document and its numbers usually fail the trust
    // gate anyway — Express fails fast and honestly instead, keeping the
    // upload → intelligence → dashboard path seconds long.
    let extraction = await extractIfrs(bytes, { enableOcr: false, allowLowText: true });
    if (coreFigureCoverage(extraction.figures) < VISION_MIN_CORE) {
      await onStage?.("DETECTING_STATEMENTS", "Reading scanned statement pages with AI vision");
      const vision = await extractViaVision(bytes, extraction.meta.quality, extraction.result.statements);
      if (vision && coreFigureCoverage(vision.figures) > coreFigureCoverage(extraction.figures)) {
        logStage("vision_extracted", document.id, startedAt, { years: vision.result.fiscalYears });
        extraction = vision;
      } else if (mode === "comprehensive") {
        await onStage?.("DETECTING_STATEMENTS", "Reading statement pages with OCR");
        const ocr = await withBudget(
          () => extractIfrs(bytes, { enableOcr: true }),
          env.OCR_FALLBACK_BUDGET_MS,
          document.fileName,
        );
        if (coreFigureCoverage(ocr.figures) >= coreFigureCoverage(extraction.figures)) extraction = ocr;
      } else if (coreFigureCoverage(extraction.figures) === 0) {
        // Express + scanned document + vision yielded nothing: nothing usable
        // exists and OCR is off the table. Fail in seconds with a way forward
        // (the checkpointed retry makes "try again" genuinely cheap).
        throw new PdfReadError(
          "NO_TEXT",
          `${document.fileName} appears to be a scanned statement and the AI document reader ` +
            "could not read it just now. Resume processing to try again, or upload the " +
            "original digital PDF issued by the auditor for instant extraction.",
        );
      }
    }
    await onStage?.("EXTRACTING_DATA");
    const blocking = extraction.validation.errors;
    logStage("extracted", document.id, startedAt, {
      textSource: extraction.meta.textSource,
      ocrPages: extraction.meta.ocrPages.length,
      ocrConfidence: extraction.meta.ocrConfidence,
      valuesTrusted: extraction.meta.valuesTrusted,
      statements: extraction.result.statements.map((s) => s.type),
      fiscalYears: extraction.result.fiscalYears,
      coreFigures: coreFigureCoverage(extraction.figures),
      blockingErrors: blocking.map((e) => e.code),
      warnings: extraction.validation.warnings.length,
    });

    // CHECKPOINT — persisted SYNCHRONOUSLY, on purpose. This row is what makes
    // a retry a RESUME: it is the durable record of work (possibly a paid
    // GPT-Vision call) that must survive a killed run. Deferring it once lost
    // every result whenever a run died before settling its deferred writes —
    // and each retry re-billed the model. Two ~150ms round-trips are a fair
    // price for never doing the same work twice.
    await persistExtraction(document.id, startedAt, extraction, null);
    await prisma.document.update({
      where: { id: document.id },
      data: { sha256, processingStatus: blocking.length ? "FAILED" : "COMPLETED" },
    });

    if (blocking.length > 0) {
      logStage("failed_validation", document.id, startedAt, { errors: blocking.map((e) => e.code) });
      return {
        ok: false,
        perf: extraction.meta.perf,
        failure: {
          documentId: document.id,
          fileName: document.fileName,
          fiscalYear: document.fiscalYear,
          message: blocking.map((e) => e.message).join(" "),
        },
      };
    }

    logStage("completed", document.id, startedAt);
    return {
      ok: true,
      perf: extraction.meta.perf,
      completed: {
        document,
        figures: extraction.figures,
        currency: extraction.result.currency,
        scale: extraction.result.scale,
        warnings: extraction.validation.warnings.map((w) => ({
          ...w,
          message: `${document.fileName}: ${w.message}`,
        })),
      },
    };
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
    return {
      ok: false,
      perf: null,
      failure: {
        documentId: document.id,
        fileName: document.fileName,
        fiscalYear: document.fiscalYear,
        message: userMessage,
      },
    };
  }
}

/**
 * Reconstructs a completed extraction from its persisted row when the bytes are
 * byte-identical to the last successful run. Only figures + currency + scale are
 * needed downstream, and they are rebuilt from the stored (already-normalized)
 * line items — no PDF read, no OCR. Returns null when there is nothing safe to
 * reuse (changed bytes, prior failure, or missing/legacy row).
 */
function reuseCachedExtraction(
  document: DocumentWithExtraction,
  sha256: string | null,
): CompletedExtraction | null {
  if (document.processingStatus !== "COMPLETED" || document.sha256 !== sha256) return null;
  const row = document.extraction;
  if (!row || row.error) return null;
  const raw = row.raw as { lineItems?: ExtractedLineItem[] } | null;
  if (!raw?.lineItems) return null;
  const validation = row.validation as ValidationOutcome | null;
  if (validation?.errors?.length) return null;
  return {
    document,
    figures: figuresByYear(raw.lineItems),
    currency: row.currency,
    scale: row.scale,
    warnings: (validation?.warnings ?? []).map((w) => ({ ...w, message: `${document.fileName}: ${w.message}` })),
  };
}

/**
 * Watchdog for the OCR fallback: races the work against a wall-clock budget.
 * On timeout the OCR workers are torn down and a clean, user-facing
 * `PdfReadError` is thrown — the document FAILS honestly instead of leaving
 * the job RUNNING forever. Orchestration guard only: OCR itself is untouched.
 */
async function withBudget<T>(
  work: () => Promise<T>,
  budgetMs: number,
  fileName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Kill the worker pool so a hung/CPU-bound OCR cannot outlive the race.
      void terminateOcr().catch(() => {});
      reject(
        new PdfReadError(
          "NO_TEXT",
          `${fileName} could not be read automatically within the time budget. ` +
            "The document appears to be a large scanned report — please upload the " +
            "audited financial statements section (statement of financial position, " +
            "profit or loss, and cash flows) as a smaller PDF.",
        ),
      );
    }, budgetMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
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
    // `perf` rides alongside the line items (no schema migration needed) so the
    // per-document stage breakdown is queryable after the fact.
    raw: extraction
      ? ({ lineItems: extraction.result.lineItems, perf: extraction.meta.perf } as unknown as Prisma.InputJsonValue)
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
): Promise<FinancialStatement[]> {
  // Year → source: labeled document first, then newest document that saw it.
  const sources = new Map<number, CompletedExtraction>();
  for (const entry of completed) {
    for (const year of entry.figures.keys()) {
      const current = sources.get(year);
      const labeled = entry.document.fiscalYear === year;
      const currentLabeled = current?.document.fiscalYear === year;
      if (!current || (labeled && !currentLabeled)) sources.set(year, entry);
    }
  }

  const rows = [...sources.entries()].map(([fiscalYear, entry]) => {
    const figures = entry.figures.get(fiscalYear)!;
    return {
      caseId,
      documentId: entry.document.id,
      fiscalYear,
      currency: entry.currency ?? "SAR",
      audited: true,
      sourceJson: {
        documentId: entry.document.id,
        fileName: entry.document.fileName,
        scale: entry.scale,
        extractedAt: new Date().toISOString(),
        parserName: "daman-ifrs-ts/1",
      },
      ...toDecimalColumns(figures),
    };
  });

  // createManyAndReturn hands the persisted rows straight back, so the caller
  // runs financial analysis on them without re-reading the case from the DB.
  const [, created] = await prisma.$transaction([
    prisma.financialStatement.deleteMany({ where: { caseId } }),
    prisma.financialStatement.createManyAndReturn({ data: rows }),
  ]);
  return created;
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
