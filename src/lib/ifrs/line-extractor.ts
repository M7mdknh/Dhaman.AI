/**
 * Extracts labelled numeric rows from a detected statement's pages. Bilingual
 * (English + Arabic). Values are retained exactly as printed alongside a
 * sign/scale-normalized decimal string. Nothing is calculated.
 *
 * Arabic amounts arrive already converted to ASCII digits by the OCR layer, so
 * the numeric regexes below are script-agnostic. Labels may sit on either side
 * of the numbers (RTL), so the label is whatever non-numeric text remains.
 */
import { AMOUNT_RE, parseAmount, scaleDecimalString } from "@/lib/ifrs/amounts";
import { CURRENCY_TERMS, SCALE_TERMS, normalizeArabic } from "@/lib/ifrs/vocab";

import type { ExtractedLineItem, LineItemValue, PageText, StatementType } from "@/lib/ifrs/types";

const YEAR_RE = /\b(19|20)\d{2}\b/g;
const LETTER_RE = /[A-Za-z؀-ۿ]/;

/** Detects the unit multiplier the statements are expressed in (EN + AR). */
export function detectScale(text: string): number {
  const ar = normalizeArabic(text);
  for (const term of SCALE_TERMS) {
    if (term.en.test(text) || term.ar.some((t) => ar.includes(normalizeArabic(t)))) {
      return term.multiplier;
    }
  }
  return 1;
}

export function detectCurrency(text: string): string | null {
  const ar = normalizeArabic(text);
  for (const term of CURRENCY_TERMS) {
    if (term.en.test(text) || term.ar.some((t) => ar.includes(normalizeArabic(t)))) return term.code;
  }
  return null;
}

/**
 * Fiscal year columns from the statement header (e.g. "Note 2025 2024" or the
 * Arabic "٢٠٢٥ ٢٠٢٤ إيضاح"). A header row carries 2-3 plausible years and no
 * large (5+ digit) amounts. Falls back to a reporting-date phrase.
 */
export function detectFiscalYears(statementText: string, fullText: string): number[] {
  for (const line of statementText.split("\n").slice(0, 18)) {
    const years = [...line.matchAll(YEAR_RE)]
      .map((m) => Number(m[0]))
      .filter((y) => y >= 1990 && y <= 2100);
    if (years.length < 2 || years.length > 3) continue;
    // Reject lines that also carry real figures (5+ digits) — those are data rows.
    const bigAmounts = (line.match(AMOUNT_RE) ?? []).filter((a) => a.replace(/\D/g, "").length >= 5);
    if (bigAmounts.length > 0) continue;
    return [...new Set(years)];
  }

  // Vertical (cell-per-line) headers: PDFs that emit each table cell as its
  // own text line never put two years on one line ("As at / December 31, /
  // 2025 / … / 2024"). Collect year tokens across the header REGION — every
  // line before the first data row (a 5+ digit amount) — in column order.
  const regionYears = headerRegionYears(statementText);
  if (regionYears.length >= 2 && regionYears.length <= 3) return regionYears;

  const dated =
    fullText.match(/(?:as\s+at|for\s+the\s+year\s+ended|ended)\s+\d{1,2}\s+\w+\s+((?:19|20)\d{2})/i) ??
    // Month-first dates: "year ended December 31, 2025"
    fullText.match(/(?:as\s+at|year\s+ended|ended)\s+\w+\s+\d{1,2},?\s+((?:19|20)\d{2})/i) ??
    fullText.match(/\b(?:31|30)\s+\S+\s+((?:19|20)\d{2})\b/); // Arabic "31 ديسمبر 2025"
  if (dated) return [Number(dated[1])];

  // Last resort (OCR mangles year-column headers): the two consecutive recent
  // years that appear most often across the document are the reporting year and
  // its comparative. Bounded to a plausible window to avoid note-referenced
  // future years (e.g. licence-expiry dates).
  return inferYearsByFrequency(fullText);
}

/** Year tokens found above the first data row, deduped, in appearance order. */
function headerRegionYears(statementText: string): number[] {
  const years: number[] = [];
  for (const line of statementText.split("\n").slice(0, 45)) {
    const big = (line.match(AMOUNT_RE) ?? []).filter((a) => a.replace(/\D/g, "").length >= 5);
    if (big.length > 0) break; // table data started — the header is over
    for (const m of line.matchAll(YEAR_RE)) {
      const year = Number(m[0]);
      if (year >= 1990 && year <= 2100 && !years.includes(year)) years.push(year);
    }
    if (years.length > 3) return []; // ambiguous header — let the fallbacks decide
  }
  return years;
}

function inferYearsByFrequency(text: string): number[] {
  const nowYear = new Date().getFullYear();
  const counts = new Map<number, number>();
  for (const m of text.matchAll(/\b(20[0-3]\d)\b/g)) {
    const y = Number(m[1]);
    if (y >= nowYear - 15 && y <= nowYear + 1) counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  let best: number[] = [];
  let bestScore = 0;
  for (const [y, c] of counts) {
    const score = c + (counts.get(y - 1) ?? 0);
    if (counts.has(y - 1) && score > bestScore) {
      bestScore = score;
      best = [y, y - 1];
    }
  }
  return best;
}

/** Best-effort company name: prominent early line on the first page. */
export function detectCompanyName(firstPage: PageText): string | null {
  for (const raw of firstPage.text.split("\n").slice(0, 10)) {
    const line = raw.trim();
    if (line.length < 4 || line.length > 90) continue;
    if (/statement|report|financial|consolidated|year\s+ended|as\s+at/i.test(line)) continue;
    if (/قائم|تقرير|ايضاح/.test(normalizeArabic(line))) continue; // statement/report/notes
    if (/^[\d(]/.test(line)) continue;
    return line;
  }
  return null;
}

/** Small standalone integer next to a label is a note reference, not an amount. */
function isNoteReference(token: string): boolean {
  return /^\(?\d{1,2}(\.\d{1,2})?\)?$/.test(token.trim());
}

export function extractLineItems(
  statement: StatementType,
  statementPages: PageText[],
  fiscalYears: number[],
  scale: number,
): ExtractedLineItem[] {
  const items: ExtractedLineItem[] = [];
  if (fiscalYears.length === 0) return items;
  for (const page of statementPages) {
    const lines = page.text.split("\n");
    for (const line of lines) {
      const item = parseLine(line, statement, fiscalYears, scale);
      if (item) items.push(item);
    }
    for (const row of reflowVerticalRows(lines, fiscalYears)) {
      const item = parseLine(row, statement, fiscalYears, scale);
      if (item) items.push(item);
    }
  }
  return items;
}

/** A printed nil cell ("-", "–", "—"): kept as 0 to preserve column order. */
const NIL_CELL_RE = /^[-–—]$/;

/**
 * Vertical (cell-per-line) table reconstruction. Some digital statements emit
 * every table cell as its own text line — the label, then the note reference,
 * then one amount line per fiscal-year column — so the per-line parser never
 * sees a label and its amounts together. Rows are reassembled here: a line
 * with letters and NO amounts, followed by amount-only lines, is one row.
 * Purely additive — lines that already pair label+amounts are parseLine's job.
 * Printed nil cells ("-") become 0 so later amounts keep their year column.
 */
function reflowVerticalRows(lines: string[], fiscalYears: number[]): string[] {
  const rows: string[] = [];
  const maxTokens = fiscalYears.length + 3; // note ref(s) + one value per year
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i].trim();
    if (!LETTER_RE.test(label)) continue;
    if ((label.match(AMOUNT_RE) ?? []).length > 0) continue; // horizontal row
    const tokens: string[] = [];
    for (let j = i + 1; j < lines.length && tokens.length < maxTokens; j++) {
      const cell = lines[j].trim();
      if (cell.length === 0) continue; // empty note column emits blank lines
      if (LETTER_RE.test(cell)) break; // next label — the row is over
      if (NIL_CELL_RE.test(cell)) {
        tokens.push("0");
        continue;
      }
      const amounts = [...cell.matchAll(AMOUNT_RE)].map((m) => m[0]);
      if (amounts.length === 0) break;
      const rest = amounts.reduce((s, a) => s.replace(a, " "), cell);
      if (/[^\s.,()%–—-]/.test(rest)) break; // not a pure numeric cell
      tokens.push(...amounts);
    }
    if (tokens.length > 0) rows.push(`${label} ${tokens.join(" ")}`);
  }
  return rows;
}

function parseLine(
  line: string,
  statement: StatementType,
  fiscalYears: number[],
  scale: number,
): ExtractedLineItem | null {
  const amounts = [...line.matchAll(AMOUNT_RE)].map((m) => m[0]);
  if (amounts.length === 0) return null;

  // Label = all non-amount text (works whether the label is left- or
  // right-aligned relative to the numbers, i.e. LTR or RTL layout).
  let label = line;
  for (const a of amounts) label = label.replace(a, " ");
  label = label
    .replace(/\((note\s+)?\d+(\.\d+)?\)/gi, "")
    .replace(/[.·…_]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (label.length < 3 || !LETTER_RE.test(label)) return null;

  // Drop leading note-reference column(s) — compound references print as
  // several small tokens ("13, 15") — then keep as many values as years.
  let tokens = amounts;
  while (tokens.length > fiscalYears.length && isNoteReference(tokens[0])) tokens = tokens.slice(1);
  if (tokens.every((t) => /^\(?(19|20)\d{2}\)?$/.test(t))) return null;

  const values: LineItemValue[] = [];
  for (let i = 0; i < Math.min(tokens.length, fiscalYears.length); i++) {
    const parsed = parseAmount(tokens[i]);
    if (parsed === null) continue;
    values.push({
      fiscalYear: fiscalYears[i],
      original: tokens[i],
      normalized: scaleDecimalString(parsed, scale),
    });
  }
  if (values.length === 0) return null;
  return { statement, originalLabel: label, normalizedKey: null, values };
}
