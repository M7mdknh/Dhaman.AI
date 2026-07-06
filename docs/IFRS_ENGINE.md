# IFRS Extraction Engine

Deterministic, LLM-free pipeline that turns uploaded audited IFRS statement
PDFs into structured, per-fiscal-year figures. Everything here is pure
TypeScript under `src/lib/ifrs/` (no I/O) orchestrated by
`src/services/extraction-service.ts`.

```
PDF bytes ── pdf-text (MuPDF) ──► per-page text
          ── statement-detector ─► which pages hold which IFRS statement
          ── line-extractor ─────► labelled rows + per-year amounts (+ scale/currency/years)
          ── normalizer ─────────► canonical figure keys (revenue, totalAssets, …)
          ── validator ──────────► errors (blocking) + warnings (surfaced)
          ── extraction-service ─► DocumentExtraction (provenance) + FinancialStatement rows
```

## Stage contracts

1. **pdf-text** — MuPDF (official Artifex WASM build, lazily imported).
   Rejects with typed `PdfReadError`: `PASSWORD_PROTECTED`, `CORRUPTED`, and
   `NO_TEXT` (image-only/scanned PDFs — average text density below 40
   chars/page). **OCR is deliberately not attempted** (see limitations).
2. **statement-detector** — a page holds a statement when its heading appears
   in the top 12 lines AND the page has ≥3 rows carrying amounts. Auditor
   reports, tables of contents, chairman letters, and notes pages are
   excluded by pattern. A heading-less page immediately following a detected
   statement with financial rows is treated as its continuation.
3. **line-extractor** —
   - *Scale*: "in thousands / '000" → ×1,000; "in millions" → ×1,000,000
     (decimal-string digit shifting — no floats anywhere in the pipeline).
   - *Currency*: SAR / USD / EUR keywords; null when undetected.
   - *Fiscal years*: the "Note  2025  2024" style column header (2–3 years,
     no other words, no ≥5-digit amounts); falls back to the "for the year
     ended …" phrase for single-year documents.
   - *Rows*: label = text before the first amount (note refs and dot leaders
     stripped); a leading 1–2 digit token is a note reference, not a value;
     parenthesised amounts are negative.
4. **normalizer** (`normalizer.ts`) — ordered regex synonym table, scoped per
   statement so ambiguous labels can't cross-match ("Revenue" on a balance
   sheet maps to nothing). First rule wins; specific rules precede generic
   ("total current assets" before "total assets"). Unmapped labels remain in
   provenance with `normalizedKey: null`. Per (figure, year) the figure's
   home statement wins, then the first printed occurrence.
5. **validator** — **errors** (block submission): missing any of the three
   required statements, or zero extractable fiscal years. **Warnings**
   (surfaced, non-blocking): missing core figures per year; balance-sheet
   mismatch (|assets − liabilities − equity| > 1% of assets).

## Persistence & lifecycle

- Extraction runs at **case submission, before the case leaves DRAFT** — a
  hard failure rejects the submission with per-file messages so the
  contractor can immediately replace the document. On success:
  `DRAFT → SUBMITTED → PARSING → ANALYSIS_READY` (audited).
- `Document.processingStatus`: `UPLOADED → PROCESSING → COMPLETED | FAILED`;
  `sha256` computed at processing time.
- `DocumentExtraction` — one row per document (latest run), storing parser
  name/version, timings, detected statements, scale, currency, fiscal years,
  the full raw line items, and the validation outcome.
- `FinancialStatement` rows are **rebuilt from scratch** on every run
  (delete-then-create, transactional). Year-source rule: figures for fiscal
  year Y come from the document *labeled* Y; comparative columns from newer
  documents only fill years no document is labeled with.

## The parser never calculates

Derivable figures (EBITDA, total debt, gross profit) are stored only when
literally printed. Derivations live in the Financial Intelligence engine
(`docs/FINANCIAL_ENGINE.md`) where they are documented and unit-tested.

## Known limitations (accepted for MVP)

- **English-language statements only** (Arabic statement support is a
  post-MVP localization effort alongside RTL).
- **No OCR** — scanned statements are rejected with a clear user message
  asking for the auditor's digital PDF.
- Column association is positional (left-to-right = newest-first years), the
  dominant convention in Saudi audited statements.
- Multi-entity/consolidated-vs-standalone distinction is not attempted; the
  first detected statement set wins.

## Tests

`tests/ifrs/` — 20 assertions across: amount parsing/scaling/exact addition,
statement detection (incl. auditor-report exclusion), header detection
(scale, currency, year columns, single-year fallback), normalization mapping
+ statement scoping, end-to-end text extraction for the strong and weak demo
profiles (exact figures, negatives), validator errors/warnings, and the full
`extractIfrs` over a real fabricated PDF (MuPDF path). Fixtures in
`tests/fixtures/` are the single source of truth shared with the sample-PDF
generator and demo seeding (`scripts/seed-demo-cases.mts`).
