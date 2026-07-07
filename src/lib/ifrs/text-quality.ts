/**
 * Text-layer quality gate. Before any detection runs, every page is graded so
 * the pipeline never silently feeds corrupt text downstream (the failure that
 * produced "Statement not found" on documents whose text layer was broken).
 *
 * A PDF maps on-screen glyphs back to real characters via each font's
 * ToUnicode table. When that table is missing (common after a PDF is
 * "compressed"/optimized) the glyphs decode to Unicode Private-Use codepoints
 * (U+E000-U+F8FF) - extractable as "text" but semantically garbage. We measure
 * that directly.
 */
import type { PageText } from "@/lib/ifrs/types";

export type PageQuality = "GOOD_TEXT" | "DAMAGED_TEXT" | "IMAGE_ONLY";

export interface PageQualityReport {
  pageNumber: number;
  quality: PageQuality;
  chars: number;
  /** Fraction of characters in the Unicode Private-Use Area (unmapped glyphs). */
  puaRatio: number;
  arabic: number;
  latin: number;
  digits: number;
}

export interface DocumentQualityReport {
  pages: PageQualityReport[];
  /** True when at least one page has a healthy, machine-readable text layer. */
  hasGoodText: boolean;
  /** Pages needing OCR (image-only or too corrupt to read). */
  ocrPageNumbers: number[];
  /** Dominant script across readable text. */
  script: "ARABIC" | "LATIN" | "MIXED" | "UNKNOWN";
}

/** Below this many non-space characters a page has effectively no text layer. */
const MIN_CHARS_PER_PAGE = 40;
/** Above this share of Private-Use glyphs the text layer is untrustworthy. */
const MAX_PUA_RATIO = 0.2;

const PUA_RE = /[-]/gu;
const ARABIC_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/gu;
const LATIN_RE = /[A-Za-z]/g;
const DIGIT_RE = /[0-9٠-٩۰-۹]/gu;

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

export function gradePage(page: PageText): PageQualityReport {
  const chars = page.text.replace(/\s/g, "").length;
  const pua = count(page.text, PUA_RE);
  const puaRatio = chars > 0 ? pua / chars : 0;
  const report: Omit<PageQualityReport, "quality"> = {
    pageNumber: page.pageNumber,
    chars,
    puaRatio,
    arabic: count(page.text, ARABIC_RE),
    latin: count(page.text, LATIN_RE),
    digits: count(page.text, DIGIT_RE),
  };

  let quality: PageQuality;
  if (chars < MIN_CHARS_PER_PAGE) quality = "IMAGE_ONLY";
  else if (puaRatio > MAX_PUA_RATIO) quality = "DAMAGED_TEXT";
  else quality = "GOOD_TEXT";

  return { ...report, quality };
}

export function assessDocument(pages: PageText[]): DocumentQualityReport {
  const graded = pages.map(gradePage);
  const good = graded.filter((p) => p.quality === "GOOD_TEXT");
  const arabic = graded.reduce((n, p) => n + p.arabic, 0);
  const latin = graded.reduce((n, p) => n + p.latin, 0);

  let script: DocumentQualityReport["script"] = "UNKNOWN";
  if (arabic > 0 && latin > 0 && Math.min(arabic, latin) / Math.max(arabic, latin) > 0.15) {
    script = "MIXED";
  } else if (arabic > latin) script = "ARABIC";
  else if (latin > 0) script = "LATIN";

  return {
    pages: graded,
    hasGoodText: good.length > 0,
    ocrPageNumbers: graded.filter((p) => p.quality !== "GOOD_TEXT").map((p) => p.pageNumber),
    script,
  };
}
