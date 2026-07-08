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

- Extraction runs **asynchronously, after submission**, as Stage 1 of the
  processing pipeline (`docs/ASYNC_PROCESSING.md`) — submission only saves the
  case (`DRAFT → PROCESSING`) and enqueues the job. A hard extraction failure
  sets the case to `PROCESSING_FAILED` with a per-file reason and is **retryable
  on the same uploaded documents** (no re-upload); the case is never lost. The
  hybrid path (`processDocument`) picks the cheapest engine that yields the core
  figures — text layer, then GPT-Vision, then OCR; the shared OCR worker is
  released after each batch.
- **Underwriting mode controls document scope** (`UNDERWRITING_MODE`): express
  reads only the latest audited statement; comprehensive reads every uploaded
  fiscal year. The engines are identical either way.
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

## Hybrid extraction — text-layer first, GPT-Vision for scanned

Daman is an AI underwriting platform, not an OCR engine — extraction exists only
to feed underwriting. The pipeline picks the cheapest engine that yields the
core figures (`src/services/extraction-service.ts` → `processDocument`):

1. **Text layer (digital PDFs)** — `extractIfrs(bytes, { enableOcr:false, allowLowText:true })`.
   ~1s, no network. If it yields ≥5 of the 8 core figures, done.
2. **GPT-Vision (scanned/damaged)** — `extractViaVision` renders ONLY the
   statement pages to images (`VISION_MAX_PAGES`, `VISION_DPI`) and asks a
   vision model for structured JSON. Replaces OCR; far better on Arabic-Indic
   tables. Output is a synthetic `IfrsExtraction` (so persistence/analysis/cache
   are unchanged), carrying a `VISION_EXTRACTION` provenance warning.
3. **OCR (last resort)** — if no vision provider is configured or it fails,
   `extractIfrs(bytes, { enableOcr:true })` still runs, so capability is never lost.

Vision figures are surfaced for underwriting but flagged for officer
verification — believable fast, verified before final decisioning.

## Performance (MVP: optimize for speed)

The engine optimizes for user-visible speed — a reliable underwriting package
*quickly*, not a perfect reconstruction of every statement. Targets: **< 10s**
for a standard digital IFRS report, **< 20s** for a scanned one.

- **Detect statement pages first, then process only those.** Detection runs on
  the cheap text layer *before* any OCR. A clean digital report never enters OCR
  at all. When OCR is needed, only the detected statement pages (+ neighbors for
  the currency/scale subtitle and a balance-sheet continuation) are rasterized —
  never the whole annual report. Fully scanned docs fall back to a bounded,
  statements-first window (`OCR_MAX_PAGES`).
- **Parallelism.** OCR pages run concurrently across a worker pool
  (`OCR_CONCURRENCY`); a case's documents are extracted concurrently
  (`DOCUMENT_CONCURRENCY`). The OCR pool is a process-wide singleton, so parallel
  documents share workers safely.
- **Caching.** On retry, a byte-identical document that already COMPLETED is not
  re-read or re-OCR'd — its figures are rebuilt from the persisted (normalized)
  line items (`reuseCachedExtraction`).
- **OCR is low-DPI by default** (`OCR_DPI=200`): OCR numerics are gated as
  low-trust regardless, so DPI mainly affects heading legibility.
- **Every stage is measured.** `StageTimer` (`src/lib/ifrs/perf.ts`) records each
  stage's duration + share of total + a bottleneck recommendation; the report is
  logged per document and per case (`[ifrs-extraction]` / `[case-processing]`)
  and persisted in `DocumentExtraction.raw.perf`. Profile a real report with
  `npx tsx scripts/benchmark-extraction.mts <file.pdf>`.
- **The full canonical figure set is still extracted** (the financial engine
  needs margins/liquidity/leverage/coverage). The eight core underwriting
  figures — revenue, net income, cash, total assets, total liabilities, total
  equity, operating cash flow, total debt — are tracked as a completeness gate
  (`CORE_FIGURE_KEYS`, `coreFigureCoverage`), not as the only fields captured.

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
