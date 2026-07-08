/**
 * Full IFRS extraction pipeline: PDF bytes → quality gate → (text layer and/or
 * OCR) → bilingual statement detection → line items → normalized figures →
 * validation. Pure orchestration over src/lib/ifrs/* — no Prisma, no framework.
 *
 * Architecture (see docs/IFRS_ENGINE.md):
 *   1. extractPdfPages   — per-page text layer
 *   2. assessDocument    — grade each page GOOD_TEXT / DAMAGED_TEXT / IMAGE_ONLY
 *   3. OCR (opt-in)      — rasterize + recognize the pages that lack good text
 *   4. detectStatements  — bilingual, layout-agnostic, on the best text per page
 *   5. extract/normalize — line items → canonical figures
 *   6. validate          — structural errors + quality/OCR diagnostics
 *
 * Numbers recovered by OCR are treated as low-trust: unless they pass an
 * internal consistency cross-check they are NOT promoted to trusted figures,
 * and a blocking diagnostic is raised instead of emitting unverified financials
 * into underwriting.
 */
import { addAmounts, compareAmounts } from "@/lib/ifrs/amounts";
import { env } from "@/lib/env";
import {
  detectCurrency,
  detectCompanyName,
  detectFiscalYears,
  detectScale,
  extractLineItems,
} from "@/lib/ifrs/line-extractor";
import { figuresByYear, normalizeLineItems, type FiguresByYear } from "@/lib/ifrs/normalizer";
import { ocrPages } from "@/lib/ifrs/ocr";
import { extractPdfPages } from "@/lib/ifrs/pdf-text";
import { StageTimer, STAGE, type PerfReport } from "@/lib/ifrs/perf";
import { rasterizePages } from "@/lib/ifrs/raster";
import { detectStatements } from "@/lib/ifrs/statement-detector";
import { assessDocument, type DocumentQualityReport } from "@/lib/ifrs/text-quality";
import { PdfReadError, type DetectedStatement } from "@/lib/ifrs/types";
import { validateExtraction } from "@/lib/ifrs/validator";

import type {
  ExtractionResult,
  TextSource,
  ValidationIssue,
  ValidationOutcome,
} from "@/lib/ifrs/types";

/** Provenance describing HOW an extraction was obtained (for logging + trust). */
export interface ExtractionMeta {
  textSource: TextSource;
  quality: DocumentQualityReport;
  /** 1-based page numbers recovered via OCR. */
  ocrPages: number[];
  /** Mean OCR confidence (0-100) over OCR'd pages, or null when none. */
  ocrConfidence: number | null;
  /** False when the figures were read from OCR and could not be cross-verified. */
  valuesTrusted: boolean;
  /** Per-stage timing breakdown (duration + share + tuning recommendations). */
  perf: PerfReport;
}

export interface IfrsExtraction {
  result: ExtractionResult;
  figures: FiguresByYear;
  validation: ValidationOutcome;
  meta: ExtractionMeta;
}

export interface ExtractIfrsOptions {
  /** Enable the OCR fallback for image-only / damaged-text pages. */
  enableOcr?: boolean;
  /**
   * Cap on pages sent to OCR (OCR is ~seconds/page). Only statement pages (and
   * their neighbors) are targeted — never the whole report. Defaults to
   * `env.OCR_MAX_PAGES`.
   */
  maxOcrPages?: number;
  /** Rasterization DPI for OCR pages. Defaults to `env.OCR_DPI`. */
  ocrDpi?: number;
  /**
   * When true, a document with little/no usable text is NOT rejected — the
   * fast text-only pass returns whatever it found (possibly empty) so the
   * caller can decide to fall back to GPT-Vision. Password/corrupted PDFs still
   * reject. Used by the hybrid extraction path.
   */
  allowLowText?: boolean;
}

/** Below this OCR page confidence, numeric values are always treated as untrusted. */
const MIN_OCR_CONFIDENCE = 78;
/** Minimum usable non-space characters after OCR before we give up entirely. */
const MIN_USABLE_CHARS = 40;

/** Rejects with PdfReadError for unusable PDFs (password / corrupted / no text). */
export async function extractIfrs(
  bytes: Buffer,
  options: ExtractIfrsOptions = {},
): Promise<IfrsExtraction> {
  const timer = new StageTimer();
  const enableOcr = options.enableOcr ?? false;
  const allowLowText = options.allowLowText ?? false;

  const pages = await timer.time(STAGE.READ_TEXT, () =>
    extractPdfPages(bytes, { allowImageOnly: enableOcr || allowLowText }),
  );
  const quality = timer.sync(STAGE.ASSESS_QUALITY, () => assessDocument(pages));

  // Detect on the CHEAP text layer FIRST. For a clean digital report (the
  // common case, and the <10s target) this finds every statement and OCR is
  // never entered at all. It also tells the OCR path WHICH pages to render, so
  // we never OCR the whole annual report — only statement pages + neighbors.
  let effective = pages;
  let statements = timer.sync(STAGE.DETECT_PAGES, () => detectStatements(pages));
  let ocredPages: number[] = [];
  let ocrConfidence: number | null = null;

  if (enableOcr) {
    const targets = ocrTargets(statements, quality, pages.length, options.maxOcrPages ?? env.OCR_MAX_PAGES);
    if (targets.length > 0) {
      const raster = await timer.time(STAGE.RASTERIZE, () =>
        rasterizePages(bytes, targets, options.ocrDpi ?? env.OCR_DPI),
      );
      const ocr = await timer.time(STAGE.OCR, () => ocrPages(raster));
      const recovered = new Map(ocr.map((o) => [o.pageNumber, o.text]));
      effective = pages.map((p) =>
        recovered.has(p.pageNumber) ? { pageNumber: p.pageNumber, text: recovered.get(p.pageNumber)! } : p,
      );
      ocredPages = ocr.map((o) => o.pageNumber);
      ocrConfidence = ocr.length
        ? Math.round(ocr.reduce((sum, o) => sum + o.confidence, 0) / ocr.length)
        : null;
      // Re-detect on the recovered text: OCR may have exposed a statement whose
      // page was image-only (invisible to the first pass).
      statements = timer.sync(STAGE.DETECT_PAGES, () => detectStatements(effective));
    }
  }

  const usableChars = effective.reduce((n, p) => n + p.text.replace(/\s/g, "").length, 0);
  if (usableChars < MIN_USABLE_CHARS && !allowLowText) {
    throw new PdfReadError(
      "NO_TEXT",
      "No readable text could be recovered from this document, even with OCR. Please upload the original digital PDF issued by the auditor.",
    );
  }

  const { figures, normalized, currency, scale, companyName } = timer.sync(STAGE.EXTRACT_LINES, () => {
    const fullText = effective.map((p) => p.text).join("\n");
    const detectedScale = detectScale(fullText);
    const lineItems = statements.flatMap((statement) => {
      const statementPages = effective.filter((p) => statement.pages.includes(p.pageNumber));
      const statementText = statementPages.map((p) => p.text).join("\n");
      const years = detectFiscalYears(statementText, fullText);
      return extractLineItems(statement.type, statementPages, years, detectedScale);
    });
    const normalizedItems = normalizeLineItems(lineItems);
    return {
      figures: figuresByYear(normalizedItems),
      normalized: normalizedItems,
      currency: detectCurrency(fullText),
      scale: detectedScale,
      companyName: detectCompanyName(effective[0]),
    };
  });

  const validation = timer.sync(STAGE.NORMALIZE, () => validateExtraction(statements, figures));
  const fiscalYears = [...figures.keys()].sort((a, b) => b - a);

  // Did the detected statements' figures come from OCR pages?
  const statementPageSet = new Set(statements.flatMap((s) => s.pages));
  const figuresFromOcr = [...statementPageSet].some((p) => ocredPages.includes(p));
  const valuesTrusted = assessNumericTrust(figuresFromOcr, ocrConfidence, figures);

  const textSource: TextSource =
    ocredPages.length === 0
      ? "TEXT_LAYER"
      : quality.pages.every((p) => ocredPages.includes(p.pageNumber))
        ? "OCR"
        : "HYBRID";

  addQualityDiagnostics(validation, {
    quality,
    textSource,
    ocrConfidence,
    figuresFromOcr,
    valuesTrusted,
    hasFigures: figures.size > 0,
  });

  return {
    result: { currency, scale, fiscalYears, companyName, statements, lineItems: normalized },
    figures,
    validation,
    meta: { textSource, quality, ocrPages: ocredPages, ocrConfidence, valuesTrusted, perf: timer.report() },
  };
}

/**
 * Chooses which pages to OCR — never the whole report. Statement pages found
 * on the text layer (plus their immediate neighbors, where the currency/scale
 * subtitle and a balance-sheet continuation sit) are targeted first; image-only
 * pages are always eligible (a scanned statement is invisible to the first-pass
 * detector). When the text layer detected nothing at all (a fully scanned doc),
 * fall back to a bounded window of the pages that need OCR, statements-first.
 * The result is capped so a 100+ page report never blows the time budget.
 */
function ocrTargets(
  statements: DetectedStatement[],
  quality: DocumentQualityReport,
  pageCount: number,
  cap: number,
): number[] {
  const needsOcr = new Set(quality.ocrPageNumbers);
  if (needsOcr.size === 0) return []; // clean digital report — no OCR at all

  const anchored: number[] = [];
  const seen = new Set<number>();
  const add = (page: number) => {
    if (page >= 1 && page <= pageCount && needsOcr.has(page) && !seen.has(page)) {
      seen.add(page);
      anchored.push(page);
    }
  };
  for (const statement of statements) {
    for (const page of statement.pages) {
      add(page - 1);
      add(page);
      add(page + 1);
    }
  }

  const imageOnly = quality.pages
    .filter((p) => p.quality === "IMAGE_ONLY" && !seen.has(p.pageNumber))
    .map((p) => p.pageNumber);
  const damaged = quality.pages
    .filter((p) => p.quality === "DAMAGED_TEXT" && !seen.has(p.pageNumber))
    .map((p) => p.pageNumber);

  const ordered =
    anchored.length > 0
      ? [...anchored, ...imageOnly] // located statements + any scanned pages
      : [...imageOnly, ...damaged]; // fully scanned: statements sit up front
  return ordered.slice(0, Math.max(1, cap));
}

/**
 * OCR-recovered numbers are trusted only when confidence is adequate AND the
 * figures pass an internal cross-check (balance-sheet identity or gross-profit
 * identity). Text-layer figures are always trusted (the text is authoritative).
 */
function assessNumericTrust(
  figuresFromOcr: boolean,
  ocrConfidence: number | null,
  figures: FiguresByYear,
): boolean {
  if (!figuresFromOcr) return true;
  if (ocrConfidence !== null && ocrConfidence < MIN_OCR_CONFIDENCE) return false;
  return [...figures.values()].some(crossCheckConsistent);
}

/** True when a year's figures satisfy at least one accounting identity (±1%). */
function crossCheckConsistent(f: Partial<Record<string, string>>): boolean {
  const within = (a: string, b: string) => {
    const diff = addAmounts([a, negate(b)]);
    const tol = tenth(a, 2); // 1% of |a|
    return compareAmounts(abs(diff), tol) <= 0;
  };
  if (f.totalAssets && f.totalLiabilities && f.totalEquity) {
    if (within(f.totalAssets, addAmounts([f.totalLiabilities, f.totalEquity]))) return true;
  }
  if (f.revenue && f.cogs && f.grossProfit) {
    if (within(f.grossProfit, addAmounts([f.revenue, f.cogs]))) return true; // cogs is negative
  }
  return false;
}

interface DiagnosticContext {
  quality: DocumentQualityReport;
  textSource: TextSource;
  ocrConfidence: number | null;
  figuresFromOcr: boolean;
  valuesTrusted: boolean;
  hasFigures: boolean;
}

/** Adds precise, non-generic diagnostics for damaged / OCR'd documents. */
function addQualityDiagnostics(validation: ValidationOutcome, ctx: DiagnosticContext): void {
  const damaged = ctx.quality.pages.filter((p) => p.quality === "DAMAGED_TEXT").length;
  const imageOnly = ctx.quality.pages.filter((p) => p.quality === "IMAGE_ONLY").length;

  if (damaged > 0) {
    validation.warnings.push(warn(
      "DAMAGED_TEXT_LAYER",
      `${damaged} page(s) have a corrupt text layer (missing font Unicode maps); text was recovered by OCR.`,
    ));
  }
  if (imageOnly > 0) {
    validation.warnings.push(warn(
      "IMAGE_ONLY_PAGES",
      `${imageOnly} page(s) have no text layer (scanned); text was recovered by OCR.`,
    ));
  }
  if (ctx.textSource !== "TEXT_LAYER" && ctx.ocrConfidence !== null) {
    validation.warnings.push(warn("OCR_USED", `Text recovered via OCR at ${ctx.ocrConfidence}% mean confidence.`));
  }

  // The bank-safety gate: figures read from OCR that we cannot verify must NOT
  // flow into underwriting. Block with a precise reason, never a generic one.
  if (ctx.figuresFromOcr && !ctx.valuesTrusted) {
    validation.errors.push(err(
      "UNVERIFIED_OCR_VALUES",
      "Statements were detected, but their figures were read from a scanned/damaged page by OCR and could not be automatically verified. Please upload the original digital PDF (not a scanned or compressed copy) so the amounts can be extracted reliably.",
    ));
  }
}

function warn(code: string, message: string): ValidationIssue {
  return { code, message };
}
function err(code: string, message: string): ValidationIssue {
  return { code, message };
}

function negate(v: string): string {
  if (v === "0") return v;
  return v.startsWith("-") ? v.slice(1) : `-${v}`;
}
function abs(v: string): string {
  return v.startsWith("-") ? v.slice(1) : v;
}
/** |value| / 10^n as a decimal string (used for a ±1% tolerance at n=2). */
function tenth(value: string, n: number): string {
  const [intPart, fracPart = ""] = abs(value).split(".");
  const digits = intPart + fracPart;
  const point = intPart.length - n;
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`.replace(/0+$/, "") || "0";
  const head = digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0";
  const tail = digits.slice(point).replace(/0+$/, "");
  return tail ? `${head}.${tail}` : head;
}
