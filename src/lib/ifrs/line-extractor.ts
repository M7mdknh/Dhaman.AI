/**
 * Extracts labelled numeric rows from a detected statement's pages.
 * Values are retained exactly as printed (original) alongside a
 * sign/scale-normalized decimal string. Nothing is calculated.
 */
import { AMOUNT_RE, parseAmount, scaleDecimalString } from "@/lib/ifrs/amounts";

import type { ExtractedLineItem, LineItemValue, PageText, StatementType } from "@/lib/ifrs/types";

const YEAR_RE = /\b(19|20)\d{2}\b/g;

/** Detects the unit multiplier the statements are expressed in. */
export function detectScale(text: string): number {
  if (/in\s+millions|(sar|sr|usd)\s*(million|mn)\b/i.test(text)) return 1_000_000;
  if (/['’`]\s?000|in\s+thousands|thousands\s+of/i.test(text)) return 1_000;
  return 1;
}

export function detectCurrency(text: string): string | null {
  if (/saudi\s+riyals?|\bSAR\b|\bSR\b/i.test(text)) return "SAR";
  if (/us\s+dollars?|\bUSD\b/i.test(text)) return "USD";
  if (/euros?\b|\bEUR\b/i.test(text)) return "EUR";
  return null;
}

/**
 * Fiscal year columns, left to right, read from the statement header
 * (e.g. "Note   2025   2024"). Falls back to years found near a
 * reporting-date phrase anywhere in the document.
 */
export function detectFiscalYears(statementText: string, fullText: string): number[] {
  const headerLines = statementText.split("\n").slice(0, 15);
  for (const line of headerLines) {
    const years = [...line.matchAll(YEAR_RE)].map((m) => Number(m[0]));
    const plausible = years.filter((y) => y >= 1990 && y <= 2100);
    if (plausible.length < 2 || plausible.length > 3) continue;

    // A header row is years plus at most the "Note" column caption —
    // reject lines carrying amounts (5+ digits) or any other words.
    const bigAmounts = (line.match(AMOUNT_RE) ?? []).filter(
      (a) => a.replace(/\D/g, "").length >= 5,
    );
    if (bigAmounts.length > 0) continue;
    const residue = line
      .replace(YEAR_RE, "")
      .replace(/notes?/gi, "")
      .replace(/[^a-z]/gi, "");
    if (residue.length > 0) continue;

    return dedupe(plausible);
  }
  const dated = fullText.match(
    /(?:as\s+at|for\s+the\s+year\s+ended|ended)\s+\d{1,2}\s+\w+\s+((?:19|20)\d{2})/i,
  );
  return dated ? [Number(dated[1])] : [];
}

function dedupe(years: number[]): number[] {
  return [...new Set(years)];
}

/** Best-effort company name: prominent early line on the first page. */
export function detectCompanyName(firstPage: PageText): string | null {
  for (const raw of firstPage.text.split("\n").slice(0, 8)) {
    const line = raw.trim();
    if (line.length < 4 || line.length > 90) continue;
    if (/statement|report|financial|consolidated|year\s+ended|as\s+at/i.test(line)) continue;
    if (/^\d/.test(line)) continue;
    return line;
  }
  return null;
}

/** Small leading integer directly after a label is a note reference, not an amount. */
function isNoteReference(token: string): boolean {
  return /^\d{1,2}(\.\d{1,2})?$/.test(token.trim());
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
    for (const line of page.text.split("\n")) {
      const item = parseLine(line, statement, fiscalYears, scale);
      if (item) items.push(item);
    }
  }
  return items;
}

function parseLine(
  line: string,
  statement: StatementType,
  fiscalYears: number[],
  scale: number,
): ExtractedLineItem | null {
  const matches = [...line.matchAll(AMOUNT_RE)];
  if (matches.length === 0) return null;

  // Label = everything before the first numeric token.
  const label = line
    .slice(0, matches[0].index)
    .replace(/\((note\s+)?\d+(\.\d+)?\)/gi, "") // "(note 5)" refs inside labels
    .replace(/[.·…_]{2,}/g, " ") // dot leaders
    .trim();
  if (label.length < 3 || /^\d/.test(label)) return null;

  let tokens = matches.map((m) => m[0]);
  // Drop a leading note-reference column ("Trade receivables  6  1,234  987").
  if (tokens.length > fiscalYears.length && isNoteReference(tokens[0])) {
    tokens = tokens.slice(1);
  }
  // Rows that are just the year header repeated.
  if (tokens.every((t) => /^(19|20)\d{2}$/.test(t))) return null;

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
