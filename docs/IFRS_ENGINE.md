# IFRS Extraction Engine

Deterministic, LLM-free pipeline that turns uploaded audited IFRS statement
PDFs (English **or** Arabic) into structured, per-fiscal-year figures.
Everything under `src/lib/ifrs/` is pure (bytes in, typed results out),
orchestrated by `src/services/extraction-service.ts`.

```
PDF bytes
  ── pdf-text (MuPDF) ─────► per-page text layer
  ── text-quality ─────────► grade each page: GOOD_TEXT | DAMAGED_TEXT | IMAGE_ONLY
  ── raster + ocr ─────────► OCR fallback for damaged/image-only pages (Arabic+English)
  ── statement-detector ───► which pages hold which IFRS statement (bilingual)
  ── line-extractor ───────► labelled rows + per-year amounts (+ scale/currency/years)
  ── normalizer ───────────► canonical figure keys (revenue, totalAssets, …), EN+AR synonyms
  ── validator + extract ──► errors (blocking) + warnings + numeric-trust gate
  ── extraction-service ───► DocumentExtraction (provenance) + FinancialStatement rows
```

## Why the quality gate exists

A PDF maps on-screen glyphs back to characters via each font's `ToUnicode`
table. PDF "compressors"/optimizers frequently drop those tables, so the text
layer decodes to Unicode **Private-Use** codepoints (U+E000–F8FF) — extractable
as "text" but semantically garbage. Feeding that to a detector silently yields
"statement not found". `text-quality.ts` measures the Private-Use ratio and text
density per page and routes accordingly, so corrupt input is never trusted.

## Stage contracts

1. **pdf-text** — MuPDF (Artifex WASM, lazily imported). Rejects with typed
   `PdfReadError`: `PASSWORD_PROTECTED`, `CORRUPTED`. `NO_TEXT` is raised only
   when OCR is disabled or recovers nothing. `allowImageOnly` lets the caller
   keep image-only pages for the OCR path.
2. **text-quality** — per page: `chars`, `puaRatio` (Private-Use share),
   script mix. `GOOD_TEXT` (usable), `DAMAGED_TEXT` (>20% Private-Use),
   `IMAGE_ONLY` (<40 chars). Chooses which pages need OCR.
3. **raster + ocr** — MuPDF rasterizes flagged pages to PNG; `tesseract.js`
   (`ara`+`eng`) recovers text; Arabic-Indic digits (٠-٩) are converted to
   ASCII. OCR is **bounded**: image-only pages first (primary statements live
   there), then damaged pages nearest them, capped (default 14).
4. **statement-detector** — bilingual, layout-agnostic. A page holds a
   statement when a **heading line** ("Statement of …" / Arabic "قائمة …")
   matches a type AND the page is a financial table (≥3 four-digit rows *or*
   ≥8 numeric lines — the OCR-tolerant signal). Notes/auditor report/TOC are
   excluded (bilingual patterns; a page listing ≥3 statement types is an
   index). The balance sheet may continue onto the next un-headed page.
5. **line-extractor** — bilingual scale ("'000"/`آلاف`, millions/`ملايين`),
   currency (SAR/USD/EUR + Arabic), fiscal years (column header, else
   reporting-date phrase, else the two most frequent consecutive recent
   years). Labels are the non-numeric text on a row (either side, for RTL).
6. **normalizer** — ordered synonym table with English regexes **and** Arabic
   keyword groups, scoped per statement. First rule wins; specific before
   generic. Unmapped labels keep `normalizedKey: null`.
7. **validator + numeric-trust gate** — structural **errors** (missing a
   required statement, no fiscal years) and **warnings** (missing core
   figures, balance mismatch, `DAMAGED_TEXT_LAYER`, `IMAGE_ONLY_PAGES`,
   `OCR_USED`). Figures recovered from OCR are trusted only if confidence is
   adequate **and** they pass an accounting cross-check (balance identity or
   gross-profit identity); otherwise a blocking `UNVERIFIED_OCR_VALUES` is
   raised — unverified numbers never reach underwriting.

## Persistence & lifecycle

- Extraction runs at **case submission, before the case leaves DRAFT** — a hard
  failure rejects submission with a per-file message. OCR-enabled in the
  service (`extractIfrs(bytes, { enableOcr: true })`); the shared OCR worker is
  released after each batch.
- `Document.processingStatus`: `UPLOADED → PROCESSING → COMPLETED | FAILED`.
- `DocumentExtraction` — one row per document: parser, timings, detected
  statements, scale, currency, fiscal years, raw line items, validation.
- `FinancialStatement` rows are rebuilt from scratch on every run.
- `ExtractionMeta` (returned, logged): `textSource` (TEXT_LAYER | OCR |
  HYBRID), `ocrPages`, `ocrConfidence`, `valuesTrusted`.

## The parser never calculates, never fabricates

Derivable figures are stored only when literally printed. Numbers that OCR
cannot verify are flagged, not guessed — correctness over completeness, because
a wrong figure in underwriting is worse than a missing one.

## Known limitations

- **Arabic-Indic numeric OCR is unreliable** on dense scanned tables:
  `tesseract.js` recovers Arabic *labels/headings* well but mis-reads the
  *digits*. Such figures are gated out (`UNVERIFIED_OCR_VALUES`) rather than
  trusted. A layout-aware document-AI service is the production path for
  bank-grade numeric extraction from scanned Arabic statements.
- Wide landscape statements (e.g. Changes in Equity matrices) may OCR poorly in
  portrait; that (non-required) statement can go undetected on scanned copies.
- OCR needs the `ara`/`eng` traineddata (fetched/cached by tesseract.js).
- Best remedy for damaged uploads: the **original** issuer/Tadawul PDF, which
  normally has an intact (often bilingual) text layer — the fast, fully-trusted
  path.

## Tests

`tests/ifrs/` — amount parsing/scaling/exact addition, statement detection,
header detection, normalization, validator, and end-to-end `extractIfrs` over a
real fabricated PDF (MuPDF path). Fixtures in `tests/fixtures/` are shared with
the sample-PDF generator and demo seeding.
