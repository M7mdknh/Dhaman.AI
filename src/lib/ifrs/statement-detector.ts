/**
 * Detects which pages hold the four primary IFRS statements. Bilingual
 * (English + Arabic) and layout-agnostic: a page qualifies when a statement
 * heading appears near the top AND the page carries financial rows. This skips
 * tables of contents, the auditor's report, and notes pages.
 *
 * Statement type is matched on the HEADING LINE only (the line that says
 * "Statement of ..." / Arabic "قائمة ..."), never anywhere in the top window —
 * otherwise a body line item mentioning e.g. "loss" would mis-type the page.
 */
import { AMOUNT_RE } from "@/lib/ifrs/amounts";
import {
  EXCLUDED_HEADINGS,
  STATEMENT_HEADINGS,
  matchesArabicGroups,
  normalizeArabic,
} from "@/lib/ifrs/vocab";

import type { DetectedStatement, PageText, StatementType } from "@/lib/ifrs/types";

/** How many lines from the top of a page a heading may appear. */
const HEADING_WINDOW = 14;
/** Lines with a 4+ digit amount for a clean text layer to count as a statement. */
const MIN_FINANCIAL_ROWS = 3;
/**
 * Lines carrying any multi-digit number. OCR fragments Arabic-Indic figures
 * into short tokens, so a scanned statement may have few "4-digit" rows but is
 * still densely numeric; this is the OCR-friendly financial-table signal.
 */
const MIN_NUMERIC_LINES = 8;
/**
 * A heading line announces a statement ("Statement of ..." / Arabic "قائمة").
 * The Arabic form tolerates the common OCR misread of قائمة as قاتمة (ئ→ت).
 */
const HEADING_LINE_EN = /statement\s+of|balance\s+sheet|income\s+statement/i;
const HEADING_LINE_AR = /قائم|قاتم/; // قائمة and its frequent OCR variant قاتمة

function topLines(text: string): string[] {
  return text.split("\n").slice(0, HEADING_WINDOW);
}

function countFinancialRows(text: string): number {
  let rows = 0;
  for (const line of text.split("\n")) {
    const amounts = line.match(AMOUNT_RE) ?? [];
    if (amounts.some((a) => a.replace(/\D/g, "").length >= 4)) rows++;
  }
  return rows;
}

function countNumericLines(text: string): number {
  return text.split("\n").filter((l) => (l.match(/\d/g) ?? []).length >= 2).length;
}

/** A page that carries financial figures (clean-text OR OCR-fragmented). */
function isFinancialTable(text: string): boolean {
  return countFinancialRows(text) >= MIN_FINANCIAL_ROWS || countNumericLines(text) >= MIN_NUMERIC_LINES;
}

/** A contents/index page lists several statements; a real statement lists one. */
function distinctHeadingTypes(lines: string[]): number {
  const types = new Set<StatementType>();
  for (const line of lines) {
    const normLine = normalizeArabic(line);
    if (!(HEADING_LINE_EN.test(line) || HEADING_LINE_AR.test(normLine))) continue;
    for (const h of STATEMENT_HEADINGS) {
      if (h.en.test(line) || matchesArabicGroups(normLine, h.ar)) types.add(h.type);
    }
  }
  return types.size;
}

function isExcluded(lines: string[]): boolean {
  const head = lines.join("\n");
  const headAr = normalizeArabic(head);
  return EXCLUDED_HEADINGS.en.test(head) || matchesArabicGroups(headAr, EXCLUDED_HEADINGS.ar);
}

/** The statement type announced by a heading line in the top window, if any. */
function headingType(lines: string[]): StatementType | null {
  for (const line of lines) {
    const normLine = normalizeArabic(line);
    const isHeadingLine = HEADING_LINE_EN.test(line) || HEADING_LINE_AR.test(normLine);
    if (!isHeadingLine) continue;
    for (const h of STATEMENT_HEADINGS) {
      if (h.en.test(line) || matchesArabicGroups(normLine, h.ar)) return h.type;
    }
  }
  return null;
}

export function detectStatements(pages: PageText[]): DetectedStatement[] {
  const detected = new Map<StatementType, number[]>();

  for (const page of pages) {
    const lines = topLines(page.text);
    if (isExcluded(lines)) continue;
    if (distinctHeadingTypes(lines) >= 3) continue; // table of contents / index
    if (!isFinancialTable(page.text)) continue;

    const type = headingType(lines);
    if (type && !detected.has(type)) detected.set(type, [page.pageNumber]);
  }

  // The balance sheet is the statement that commonly splits across two pages
  // (assets, then liabilities + equity). A following page with financial rows
  // but no heading of its own continues it. Other statements are single-page.
  const fp = detected.get("FINANCIAL_POSITION");
  if (fp) {
    const next = pages.find((p) => p.pageNumber === fp[0] + 1);
    if (next) {
      const lines = topLines(next.text);
      if (!isExcluded(lines) && !headingType(lines) && isFinancialTable(next.text)) {
        detected.set("FINANCIAL_POSITION", [...fp, next.pageNumber]);
      }
    }
  }

  return [...detected.entries()].map(([type, pageNumbers]) => ({ type, pages: pageNumbers }));
}
