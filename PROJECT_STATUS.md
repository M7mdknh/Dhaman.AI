# PROJECT STATUS

> Living snapshot of where Daman V2 stands. Read this + `TODO.md` at the start
> of any session. **Last updated: 2026-07-07.**

Current Sprint

**None — the MVP is COMPLETE.** Sprint 5 (Underwriting Workspace) was
approved on 2026-07-07, and Sprint 6 was cancelled by user decision the same
day: there is no Sprint 6, the roadmap ends at Sprint 5. All sprint work is
committed on `main`.

### Post-MVP redesign — Async Financial Processing (2026-07-07)

Critical product fix: submission was blocking the user on OCR/parsing/AI and,
worse, a processing failure lost the case (it never left DRAFT). Submission and
processing are now two **completely independent** workflows.

- Submission is synchronous (seconds): one atomic transaction saves the case
  (`DRAFT → PROCESSING`, `submittedAt`), marks documents `QUEUED`, and enqueues
  a durable `CaseProcessing` job — then redirects. No OCR in the request.
- Processing is asynchronous: `runCaseProcessing` (self-claiming, idempotent) is
  triggered via Next.js `after()` and drives Reading → Detecting → Extracting →
  Financial Analysis → AI Underwriting → `ANALYSIS_READY`, writing live stage
  progress to the job row.
- The case page is the processing dashboard: `ProcessingDashboard` polls
  `GET /api/cases/[caseId]/processing` (also self-heals a lost trigger) and
  renders the ordered step checklist; refresh on success.
- Failure never loses work: gating-stage failures set `PROCESSING_FAILED` +
  the real reason on the job; the case and documents stay saved; **Retry
  Analysis** re-runs on the same documents (no re-upload). AI underwriting is
  best-effort (assists, never gates) — its failure still reaches ANALYSIS_READY
  and the officer generates the memo on demand.
- Migration `20260707134922_sprint7_async_processing` (adds `PROCESSING` /
  `PROCESSING_FAILED` case statuses, `ProcessingStage` / `ProcessingState`
  enums, `case_processing` table). See `docs/ASYNC_PROCESSING.md`.
- Verified: 89/89 unit tests (incl. new pure step-derivation suite); typecheck
  + lint + production build clean; both workflows exercised end-to-end against
  the real DB via `scripts/seed-demo-cases.mts` (submit → PROCESSING/QUEUED,
  pipeline → ANALYSIS_READY) plus a fail-path script (bad PDF → PROCESSING_FAILED
  with case + document retained → retry re-arms, no re-upload).

### RC1 pre-production hardening (2026-07-07)

Full engineering/security/deployment audit (RC1). Outcome: no Critical issues;
"Needs Minor Fixes" driven almost entirely by serverless operational hardening.
The stale ledger items were reconciled (rate limiting, security headers, and
object storage were already DONE; the seed-password risk is guarded by
`NODE_ENV`). Two HIGH deployment items were then fixed:

- **Async execution (Vercel Hobby-compatible).** Processing starts immediately
  after submission via Next.js `after()` — no cron, no scheduled jobs, no paid
  Vercel features. (An interim cron-drainer + `maxDuration=300` approach was
  built and then **removed**: Vercel Cron needs a paid cadence and blocked the
  Hobby deploy, and the `maxDuration` overrides would exceed the Hobby function
  cap.) Resilience without a scheduler: a lost `after()` trigger self-heals on
  the next dashboard poll (still-QUEUED jobs re-fire, self-claiming); a run
  killed mid-flight surfaces as a stall with a one-click **Retry Analysis**.
- **OCR packaging.** Declared `sharp` as a direct dependency (was only a
  transitive/optional dep of `next`); added `sharp` + `tesseract.js` to
  `serverExternalPackages`; made the tesseract core/lang/cache paths
  env-configurable (`TESSERACT_*`) with the writable-cache default at `/tmp`,
  removing the hard reliance on a read-only FS and on runtime CDN resolution
  for the WASM core.
- Docs reconciled: `TECH_DEBT.md` (#2/#9/#11 resolved, #4 mitigated, new #23/#24
  + Neon environment note), stale service comments, README deploy section,
  `.env.example`.
- Verified: 89/89 unit tests; typecheck + lint + production build clean
  (`/api/cron/process` registered as a dynamic function).

---

## Stack (decided 2026-07-05)

Full-stack TypeScript: Next.js 15 · Prisma 7 · PostgreSQL · shadcn/ui · zod.
FastAPI is NOT used.

---

## Completed

### Sprint 0 — Foundation (2026-07-05)

- Repo, docs, PostgreSQL + Prisma 7, initial migration (7 models, Decimal
  money, cuid ids, append-only audit)
- Authentication: register (contractor-only), login, logout; bcrypt(12);
  verified JWT cookie (8h); roles; middleware + protected layout
- App shell: sidebar + topbar, banking design tokens; seed (3 users, 3 companies)
- Verified: production build; 13/13 browser E2E checks

### Sprint 1 — Contractor Workspace (2026-07-06)

Re-scoped by user directive: absorbed the former Dashboard + Case Wizard
sprints (auth hardening → backlog).

- Migration `20260706013501_sprint1_contractor_workspace`: Company contact
  block; ContractDetails +description/currency/guaranteePercentage/start–end
  dates/paymentTerms/notes (drops durationMonths); Document.fiscalYear
- Contractor dashboard: 4 stat cards, cases table, instant client-side
  search + status filter, empty states, skeletons; officer placeholder
- 4-step case wizard (persistent stepper, drafts persist on every step
  transition): Company Info (auto-populated; creates the company for
  first-time contractors) → Contract Details (full zod validation, Decimal
  strings end-to-end) → IFRS upload (per-year PDF, XHR progress, remove,
  10 MB, magic-byte check, one per fiscal year) → Review & Submit
  (confirmation dialog)
- Case reference `UC-YYYY-NNNNNN` minted from internal `seq` in a transaction
- Case details page: summaries (shared components with review step),
  authenticated document download, growable lifecycle timeline
- Business rules enforced in services: ownership scoping on every read,
  DRAFT-only editing/deleting, submit requires contract details + ≥1
  statement; submitted cases read-only for contractors
- Audit trail for every mutation (case.created, draft_saved/updated,
  submitted, draft_deleted, document.uploaded/removed, company.*)
- Storage adapter (`lib/storage.ts`): local disk under `UPLOAD_DIR`
  (git-ignored), server-generated keys, cloud-ready seam
- Verified: production build clean; **28/28 browser E2E checks** (full flow,
  validation, uploads, read-only, delete, search, ownership isolation) plus
  direct API tests (fake PDF, bad year, duplicate year, oversize → 400s);
  audit rows confirmed in PostgreSQL

### Sprint 2 — IFRS Parsing (2026-07-06)

- Deterministic PDF extraction (MuPDF WASM — no LLM/OCR; scanned PDFs
  rejected with a clear message); statement detection (position / P&L /
  cash flows, 2-page spans, auditor report excluded)
- Line-item normalization via statement-scoped regex synonym table; scale
  ("'000"/millions) + parenthesised negatives; decimal strings, no floats
- One `FinancialStatement` row per fiscal year + `DocumentExtraction`
  provenance (raw items, validation, timings, sha256)
- Pipeline runs at submission BEFORE leaving DRAFT; per-file failure
  messages; `SUBMITTED → PARSING → ANALYSIS_READY`
- Extracted-figures review UI; unusable-document flagging
- Verified: unit tests; full pipeline through the real services for all 3
  demo profiles. See `docs/IFRS_ENGINE.md`.

### Sprint 3 — Financial Intelligence Engine (2026-07-06)

- Pure deterministic TypeScript engines (`services/finance/` +
  `lib/finance/`), no AI in any figure; every tunable constant in
  `lib/finance/thresholds.ts`. See `docs/FINANCIAL_ENGINE.md`.
- Ratio engine (19 ratios + working capital / FCF), YoY growth, multi-year
  trends, 13 rule-based risk flags with evidence
- **Underwriting Capacity** (primary KPI, 0–100, 10 weighted components) and
  **Risk Score** (secondary, 0–100 higher = riskier, 6 components ported from
  V1 `core/risk.py`) with five configurable bands EXCELLENT→CRITICAL;
  missing inputs are excluded + renormalized, never silently scored
- Reusable `RiskGauge` (SVG meter: score, band, supporting metrics) +
  `StatTile`; polished analysis dashboard: capacity primary, risk gauge
  secondary, KPI strip (liquidity / leverage / profitability / cash flow /
  growth), flags, trend charts, ratio tables
- **Decisions (2026-07-06):** no `FinancialAnalysis` table — analysis is
  computed on demand (immutable Analysis Snapshots arrive with the AI
  sprint); confidence score moved to Sprint 4 (belongs to the AI Underwriter)
- Verified: 51/51 unit tests (risk engine expectations hand-computed);
  typecheck + lint + production build clean; dashboard exercised against the
  three seeded demo profiles

### Sprint 4 — Decision Intelligence (2026-07-06)

- LLM provider abstraction (`lib/ai/`): one-interface `LLMProvider` + typed
  retryable errors; OpenAIProvider (plain fetch, JSON mode, timeout) and
  MockProvider (deterministic template, clearly labeled). No API key →
  MockProvider automatically; the app never crashes and stays deployable.
  See `docs/DECISION_INTELLIGENCE.md`.
- Prompt builder (isolated, versioned `v1`): structured JSON only — company
  registration data (personal contacts excluded), contract, ratios by
  category, growth, trends, flags, capacity, risk + bank policy. Never PDFs,
  never raw statements.
- `DecisionIntelligenceService`: response cache by input hash (identical
  inputs → no repeat provider call), 3 attempts with backoff (AUTH never
  retried), strict zod validation (invalid responses rejected), append-only
  `DecisionIntelligence` rows freezing the exact input snapshot, audit
  trail for generated/failed.
- Recommendation of record derived deterministically from the risk band
  (`RECOMMENDATION_BY_BAND`); a diverging model suggestion is stored and
  flagged, never adopted.
- UI: case-page Decision Intelligence panel (summary, strengths/weaknesses,
  recommendation badge, missing info, next steps, provenance footer) and the
  professional Underwriting Package at `/cases/[id]/package` (9 sections,
  Computed vs AI-drafted chips, print-friendly).
- Migration `20260706135139_sprint4_decision_intelligence`;
  env: optional `OPENAI_API_KEY` / `OPENAI_MODEL` / `LLM_PROVIDER` /
  `LLM_TIMEOUT_MS`.
- Verified: 68/68 unit tests; typecheck + lint + production build clean;
  full mock-provider flow exercised in the browser on the seeded demo cases;
  invalid-key AUTH path surfaces a clean error.

### Sprint 5 — Underwriting Workspace (2026-07-07)

- Officer review queue on the dashboard (tabs pending/all/decided, search,
  server-side pagination, capacity/risk/priority per row — priority derived
  deterministically from risk band + exposure, `lib/review.ts`)
- Review workspace `/review/[id]`: header band (company, guarantee,
  contract value, submission, assigned officer, priority), timeline (left),
  AI memo + full Financial Intelligence + company/contract overviews +
  documents with processing status (center), sticky decision sidebar (right)
- Explicit review lifecycle: Start Review (viewing never changes state,
  first starter = assigned officer) → Approve / Approve with Conditions /
  Reject / Request More Information (mandatory reason + confirmation on
  every action) → Resume after info. Transition rules pure + exhaustively
  unit-tested (`lib/review.ts`); enforced in `review-service`
- Decisions as append-only data (`OfficerDecision`: officer, timestamp,
  reason, conditions, memo id); internal `CaseNote`s (never
  contractor-visible)
- **Memo visibility resolved (was TECH_DEBT #16): the AI memo, memo
  generation, and the Underwriting Package are officer-only.** The
  contractor sees decision status, request-info message, approval
  conditions, and the issued LG — never internal reasoning or notes
- Letter of Guarantee (⏩ absorbed from Sprint 6): `Guarantee` entity
  (1:1 case, `LG-YYYY-NNNNNN`, particulars frozen at issue), professional
  pdf-lib PDF with QR verification stamp rendered on demand (never stored),
  authenticated download for bank staff + owning contractor
- Migration `20260707015058_sprint5_officer_workspace`; deps: `pdf-lib`,
  `qrcode`
- Audit: officer.case_opened (deduped 15 min) / review_started /
  review_resumed / decided / note_added / document_downloaded,
  guarantee.issued / pdf_downloaded
- Verified: 82/82 unit tests; typecheck + lint + production build clean;
  browser E2E of the full officer flow (queue → start review → decide →
  issue LG → download PDF; reject + request-info paths; contractor
  visibility restrictions). See `docs/UNDERWRITING_WORKSPACE.md`.

## Demo accounts

| Email | Role | Password |
| --- | --- | --- |
| admin@daman.local | Admin | `Daman!2026` |
| officer@daman.local | Risk Officer | `Daman!2026` |
| contractor@daman.local | Contractor | `Daman!2026` |

---

## Next

Nothing scheduled — Sprint 6 (Guarantee Registry & Audit Reporting) was
cancelled by user decision (2026-07-07). If work resumes, the candidates
are the auth-hardening backlog in `TODO.md` and the register in
`TECH_DEBT.md` (notably: committed E2E suite, CI, object storage before any
cloud deployment).

---

## Blockers / environment constraints

- The database is now **Neon cloud Postgres** (pooled). The normal Prisma flow
  works: `prisma migrate deploy` applies migrations and `migrate dev
  --create-only` authors them — the old local shadow-DB / `CREATEDB` workaround
  is no longer needed. Neon is remote, so CLI round-trips are slower and can hit
  a transient `ETIMEDOUT` (retry); this is not app latency.
- Node via nvm (`v24.18.0`) — not on the default non-interactive PATH.
- **Next.js 15.5 production bug:** a client-side `router.replace` that changes
  only searchParams silently never commits (RSC fetch succeeds, URL/UI don't
  update; works in dev). Dashboard filtering is therefore client-side
  in-memory. Re-test on the next Next.js upgrade.

---

## Notes

- Known debt and intentional shortcuts are tracked in `TECH_DEBT.md`.
- Reference implementation: `../wakeel-ai` (V1). Its pure financial engine
  (`backend/app/core/`) is the blueprint for the Financial Intelligence
  sprint. Its security flaws (unverified JWTs, no ownership checks,
  client-filename storage paths) must NOT be carried over.
- Every sprint must end deployable.
