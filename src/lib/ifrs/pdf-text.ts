/**
 * PDF → per-page text via MuPDF (official Artifex WASM build — the same
 * engine PyMuPDF wraps, but TypeScript-native; decision approved 2026-07-06).
 *
 * Raises PdfReadError for password-protected, corrupted, and image-only
 * (scanned) documents. OCR is intentionally NOT attempted — see
 * docs/IFRS_ENGINE.md "Known limitations".
 */
import { PdfReadError, type PageText } from "@/lib/ifrs/types";

import type * as MupdfModule from "mupdf";

/** Below this average character density we treat the PDF as scanned. */
const MIN_CHARS_PER_PAGE = 40;

// Lazy ESM import: mupdf ships a WASM binary with top-level await; loading
// it on demand keeps every consumer (Next, vitest, tsx scripts) happy.
let mupdfModule: Promise<typeof MupdfModule> | null = null;
function loadMupdf(): Promise<typeof MupdfModule> {
  mupdfModule ??= import("mupdf");
  return mupdfModule;
}

export interface ExtractPagesOptions {
  /**
   * When true, image-only / low-text documents are returned as-is instead of
   * raising NO_TEXT — the caller intends to recover text via OCR. Password and
   * corrupted PDFs still reject (OCR cannot help those).
   */
  allowImageOnly?: boolean;
}

export async function extractPdfPages(
  bytes: Buffer,
  options: ExtractPagesOptions = {},
): Promise<PageText[]> {
  const mupdf = await loadMupdf();
  let document: MupdfModule.Document;
  try {
    document = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch {
    throw new PdfReadError(
      "CORRUPTED",
      "The file could not be read as a PDF. Please re-export it and upload again.",
    );
  }

  try {
    if (document.needsPassword()) {
      throw new PdfReadError(
        "PASSWORD_PROTECTED",
        "This PDF is password protected. Please upload an unprotected copy.",
      );
    }

    const pageCount = document.countPages();
    const pages: PageText[] = [];
    let totalChars = 0;

    for (let i = 0; i < pageCount; i++) {
      const page = document.loadPage(i);
      try {
        const text = page.toStructuredText("preserve-whitespace").asText();
        totalChars += text.replace(/\s/g, "").length;
        pages.push({ pageNumber: i + 1, text });
      } finally {
        page.destroy();
      }
    }

    if (pageCount === 0) {
      throw new PdfReadError("CORRUPTED", "The PDF contains no pages.");
    }
    if (!options.allowImageOnly && totalChars < MIN_CHARS_PER_PAGE * pageCount) {
      throw new PdfReadError(
        "NO_TEXT",
        "This document appears to be scanned (no selectable text). Please upload the original digital PDF issued by the auditor.",
      );
    }

    return pages;
  } finally {
    document.destroy();
  }
}
