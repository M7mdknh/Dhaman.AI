# Daman Roadmap

Stack: Next.js 15 · TypeScript · Prisma · PostgreSQL · shadcn/ui

Every sprint ends with a deployable application.
After every sprint: update this file and PROJECT_STATUS.md.

---

# Sprint 0 — Foundation ✅ (completed 2026-07-05)

Scope expanded by agreement to include the authentication foundation and the
application shell (originally Sprint 1/2 items — marked ⏩ below).

## Repository & Docs

- [x] Initialize git repository
- [x] Remove broken empty files in `docs/` (names contained leading spaces)
- [x] Write `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/PHASES.md`
- [x] Remove create-next-app boilerplate (page, public assets)
- [x] Set app metadata (title, description)
- [x] Move `prisma` and `shadcn` to devDependencies

## Database Foundation

- [x] Local PostgreSQL (native service; Docker unavailable on this machine)
- [x] Prisma schema: `User`, `Company`, `UnderwritingCase`, `ContractDetails`, `FinancialStatement`, `Document`, `AuditLog`
- [x] All money fields use `Decimal(18,2)`
- [x] Approved schema refinements: FinancialStatement→Document FK, internal case `seq`, `User.companyId` (Company 1→N Users)
- [x] Initial migration (`20260705153143_init`)
- [x] Seed script (admin + officer + contractor, 3 demo companies, contractor linked to company)
- [x] `.env.example` + zod-validated env loading

## Authentication foundation ⏩

- [x] Register (contractor self-registration; staff provisioned via seed/admin)
- [x] Login / Logout (bcrypt hashes, signed httpOnly session cookie, 8h TTL)
- [x] User roles: `CONTRACTOR`, `RISK_OFFICER`, `ADMIN`
- [x] Route protection middleware (verified JWT; unauthenticated → login)
- [x] Login + Register pages (enterprise styling, accessible field errors)
- [x] Audit log entries: login, failed login, logout, register

## App shell & design system ⏩

- [x] Banking design tokens (Inter, neutral palette, emerald accent, light + dark tokens)
- [x] Sidebar (role-aware nav config) + top bar (user, role badge, sign out)
- [x] Protected `(app)` layout group; placeholder dashboard (no widgets)
- [x] `lint` + `typecheck` pass clean

**Verified:** production build; 13/13 browser E2E checks (register, login,
wrong password, logout, route protection, role badges, duplicate email);
seeded data + audit trail confirmed in PostgreSQL.

---

# Sprint 1 — Contractor Workspace ✅ (completed 2026-07-06)

Re-scoped by user directive (2026-07-06): Sprint 1 became the full Contractor
Workspace, absorbing the former Sprint 2 (Enterprise Dashboard) and Sprint 3
(Underwriting Case Wizard). Auth hardening moved to the Backlog below.

## Dashboard

- [x] Welcome section + "New Underwriting Case" CTA
- [x] Statistics cards (drafts, submitted, under review, approved)
- [x] Cases table (reference, contract, beneficiary, guarantee, status, updated)
- [x] Instant search + status filter (client-side; see TECH_DEBT #13)
- [x] Empty states, loading skeletons, toasts
- [x] SAR currency + date + file-size formatters (`lib/format.ts`)
- [x] Officer/Admin placeholder (their workspace is a later sprint)

## Case Lifecycle

- [x] Create case (4-step wizard: Company → Contract → Statements → Review)
- [x] Draft auto-saved on every step transition; resume any time
- [x] Edit case (while draft), persistent clickable stepper, state kept across steps
- [x] Delete case (while draft) with confirmation dialog + file cleanup
- [x] Submit case (`DRAFT → SUBMITTED`, enforced in service; sets `submittedAt`)
- [x] Submitted cases read-only for contractors (edit route redirects)

## Company Information (Step 1)

- [x] Auto-populated from the authenticated company; edits update the profile
- [x] First-time contractors create their company here (name, CR, sector, city, contact)

## Contract Details (Step 2)

- [x] Beneficiary + type, title, description, sector, location
- [x] Contract value + currency, guarantee amount/type/percentage
- [x] Project start/end dates, payment terms, notes (Decimal money, never float)
- [x] zod validation: guarantee ≤ contract value, end after start, % in (0,100]

## IFRS Upload (Step 3)

- [x] Per-year PDF upload (2025/2024/2023) with real progress + remove
- [x] Validation: PDF only (mime + magic bytes), 10 MB cap, one file per year
- [x] Server-generated storage keys; storage adapter (local disk now, cloud later)
- [x] Authenticated download route (no public URLs); "Uploaded · Pending Analysis" badges

## Case Details Page

- [x] Status, company info, contract details, documents
- [x] Growable lifecycle timeline (Created / Draft Saved / Submitted + upcoming stages)

## Audit Logging

- [x] case.created / case.draft_saved / case.draft_updated / case.submitted /
      case.draft_deleted / document.uploaded / document.removed /
      company.created / company.profile_updated (stored only — no UI yet)

**Verified:** production build clean; 28/28 browser E2E checks (full wizard flow,
validation, uploads, submit, read-only, delete, search, ownership isolation);
server-side upload rejections (fake PDF, bad year, duplicate year, oversize).

---

# Backlog — Auth hardening (formerly Sprint 1)

- [ ] Login rate limiting / temporary lockout (brute-force protection)
- [ ] Session revocation strategy (stateless JWT cannot be invalidated server-side today)
- [ ] Admin user management (provision Risk Officer / Admin accounts in-app)
- [ ] Password reset flow
- [ ] Mobile navigation drawer (sidebar is hidden below `md`)

---

# Sprint 2 — IFRS Parsing ✅ (completed 2026-07-06)

- [x] Deterministic PDF text extraction (MuPDF WASM; no LLM, no OCR — scanned PDFs rejected with a clear message)
- [x] Statement detection (financial position, profit or loss, cash flows; auditor report/TOC excluded; 2-page spans)
- [x] Line-item normalization to canonical figures (statement-scoped regex synonym table; unmapped labels kept in provenance)
- [x] Multi-year extraction (year column headers + single-year fallback; scale "'000"/millions; parenthesised negatives; decimal strings — no floats)
- [x] `FinancialStatement` rows (one per fiscal year) + `DocumentExtraction` provenance (raw line items, validation, timings)
- [x] Parsing pipeline with real status: runs at submission BEFORE leaving DRAFT; failures reject with per-file messages; `SUBMITTED → PARSING → ANALYSIS_READY`; `Document.processingStatus` + sha256
- [x] Extracted-figures review UI on the case page (per-year table + validation warnings)
- [x] Unusable-document flagging (password/corrupted/scanned/missing statements)
- [x] Parser unit tests (20 assertions incl. real-PDF integration) + shared fixtures + demo-case seeding script

**Verified:** unit tests green; full pipeline exercised through the real
services for all three demo profiles (2 fiscal years each, exact figures,
ANALYSIS_READY). See `docs/IFRS_ENGINE.md`.

---

# Sprint 3 — Financial Intelligence Engine ✅ (completed 2026-07-06)

Pure TypeScript, fully unit-tested. The LLM is never involved.
Full algorithms + formulas: `docs/FINANCIAL_ENGINE.md`.

- [x] Ratio engine: liquidity, leverage, profitability, efficiency, cash flow, coverage (port from V1 `core/ratios.py`)
- [x] Trend analysis (year-over-year, port from V1 `core/trends.py`)
- [x] Risk flags (revenue swings, debt increase, margin deterioration, …)
- [x] Execution capacity score — surfaced as **Underwriting Capacity**, the platform's primary KPI (contract size vs revenue / liquidity / coverage)
- [x] Risk score + band (transparent weighted rules, port from V1 `core/risk.py`; five bands EXCELLENT→CRITICAL, all thresholds configurable in `lib/finance/thresholds.ts`)
- [x] Reusable risk gauge component (score, band, supporting metrics)
- [x] Analysis dashboard: capacity (primary) + risk gauge (secondary), KPI strip (liquidity, leverage, profitability, cash flow, growth), flags, trend charts, ratio tables
- [x] Full unit test suite for all engine modules (hand-computed expectations)
- ~~Confidence score~~ — moved to Sprint 4 by user decision 2026-07-06 (confidence belongs to the AI Underwriter)
- ~~`FinancialAnalysis` table~~ — will NOT be built (user decision 2026-07-06): analysis is deterministic and computed on demand; immutable Analysis Snapshots arrive with the AI/officer sprints

**Deployable:** submitted cases show a deterministic financial analysis.

---

# Sprint 4 — AI Underwriter / Decision Intelligence ✅ (completed 2026-07-06)

The AI explains and drafts. It never calculates and never decides.
Full pipeline + provider architecture: `docs/DECISION_INTELLIGENCE.md`.

- [x] LLM provider abstraction (`lib/ai/`): one-interface `LLMProvider`, typed retryable errors; OpenAIProvider (fetch, JSON mode, timeout) + MockProvider; future providers = one file + factory entry
- [x] Env-gated, never crashes: no `OPENAI_API_KEY` → MockProvider automatically (deterministic template, clearly labeled); app stays deployable without AI
- [x] Prompt builder (isolated, versioned): structured JSON input only — company (no personal contacts), contract, ratios by category, growth, trends, flags, capacity, risk — never PDFs, never raw statements
- [x] DecisionIntelligenceService: cache by input hash (identical inputs → no repeat calls), 3 attempts with backoff, zod-validated strict JSON contract (invalid → rejected), persistence, audit trail
- [x] Executive summary + underwriting memo (strengths, weaknesses, contract assessment, risk explanation, missing information, next steps)
- [x] Recommendation derived deterministically from risk band (`RECOMMENDATION_BY_BAND` in thresholds.ts — never by the model); model divergence stored + flagged, policy prevails
- [x] Confidence explanation surfaced with the memo (moved from Sprint 3 by decision 2026-07-06)
- [x] Immutable Analysis Snapshot persisted with every memo (`inputSnapshot` — the frozen engine report the memo explains)
- [x] Case page Decision Intelligence panel + professional Underwriting Package (`/cases/[id]/package`) with Computed / AI-drafted provenance labels
- [x] Unit tests: prompt builder, response schema, mock provider, retry policy

**Deployable:** every analyzed case carries an AI memo; works with no API key.

---

# Sprint 5 — Underwriting Workspace (Risk Officer) ✅ (completed 2026-07-07)

Re-scoped by user directive (2026-07-07): Sprint 5 absorbed Letter of
Guarantee generation from Sprint 6 (entity, PDF, QR, authenticated
download). Full workflow + audit catalog: `docs/UNDERWRITING_WORKSPACE.md`.

- [x] Officer queue on the dashboard: tabs (pending / all / decided), search, server-side pagination, capacity/risk/priority columns
- [x] Review workspace `/review/[id]`: header band, timeline (left), memo + full financial intelligence + company/contract + documents (center), sticky decision sidebar (right)
- [x] Explicit "Start review" action (viewing NEVER changes state; first officer to start = assigned officer)
- [x] Approve / Approve with Conditions / Reject / Request More Information — mandatory reason, confirmation dialog on every action ("Manual Review" is deliberately not an officer decision: the officer IS the manual review)
- [x] Decision recorded as data (`OfficerDecision`, append-only: officer, timestamp, reason, conditions, memo id) — not only in audit log
- [x] Internal notes (`CaseNote`) — bank staff only, never contractor-visible
- [x] Contractor sees decision status, request-info message, approval conditions, LG download — never internal reasoning; AI memo + Underwriting Package now officer-only (TECH_DEBT #16 resolved)
- [x] Deterministic queue priority (risk band + exposure, thresholds in `lib/finance/thresholds.ts`)
- [x] Authorization: officer entry points gate on role, contractor paths stay ownership-scoped; officer document access audited
- [x] Audit entries for every officer action (case_opened, review_started/resumed, decided, note_added, document_downloaded, guarantee issued/downloaded)
- [x] `Guarantee` entity (1:1 case, `LG-YYYY-NNNNNN` from internal seq, particulars frozen at issue time) ⏩ from Sprint 6
- [x] Professional LG PDF (pdf-lib letterhead layout, particulars table, signature block, QR verification stamp) rendered on demand — never stored ⏩
- [x] Authenticated LG download route (bank staff + owning contractor, audited) ⏩
- [x] Unit tests: exhaustive transition rules, priority derivation, LG reference minting, PDF rendering

**Deployable:** an officer takes a case from queue to final decision and an
issued, downloadable Letter of Guarantee.

---

# ~~Sprint 6 — Guarantee Registry & Audit Reporting~~ CANCELLED (2026-07-07)

Cancelled by user decision on Sprint 5 approval: **there is no Sprint 6 —
the MVP roadmap ends at Sprint 5.** LG generation itself had already shipped
in Sprint 5; the registry list, guarantee detail page, and exportable
per-case audit report will not be built. (Audit data itself is fully
recorded in `AuditLog`; only the reporting UI was cut.)

---

# Future (do NOT implement — architecture-ready only)

- [ ] Saudi Open Banking (`ExposureProvider` interface + mock only)
- [ ] SIMAH (`CreditBureauProvider` interface + mock only)
- [ ] Core Banking Integration
