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

# Sprint 1 — Authentication (re-baselined)

Core auth shipped early in Sprint 0 ⏩. Remaining hardening candidates —
scope to be confirmed before starting:

- [ ] Login rate limiting / temporary lockout (brute-force protection)
- [ ] Session revocation strategy (stateless JWT cannot be invalidated server-side today)
- [ ] Admin user management (provision Risk Officer / Admin accounts in-app)
- [ ] Password reset flow
- [ ] Mobile navigation drawer (sidebar is hidden below `md`)

**Deployable:** hardened auth; everything in Sprint 0 still green.

---

# Sprint 2 — Enterprise Dashboard

- [x] App shell: sidebar navigation + top bar (user menu, role badge) ⏩ Sprint 0
- [ ] Statistics cards (total cases, drafts, submitted, total requested amount)
- [ ] Recent cases table
- [ ] Empty states, loading skeletons, error states
- [ ] Role-aware navigation (contractor vs officer items as features land)
- [ ] SAR currency + date formatters (shared lib)

**Deployable:** login lands on a working dashboard with live data.

---

# Sprint 3 — Underwriting Case Wizard

## Case Lifecycle

- [ ] Create case (multi-step wizard)
- [ ] Save draft / resume draft
- [ ] Edit case (while draft)
- [ ] Delete case (while draft)
- [ ] Submit case (status: `draft` → `submitted`, state machine enforced)

## Contract Details (wizard step)

- [ ] Beneficiary + beneficiary type (government / private)
- [ ] Contract title, sector, project location
- [ ] Contract value, requested guarantee amount, guarantee type
- [ ] Duration (months)
- [ ] Validation: guarantee ≤ contract value, positive amounts (zod + react-hook-form)

## IFRS Upload (wizard step)

- [ ] Multiple PDF upload
- [ ] Validation: file type allowlist, size limit
- [ ] Server-generated storage keys (never client filename)
- [ ] Storage adapter interface (local disk now; cloud later)
- [ ] Case detail page (contract summary + uploaded documents)
- [ ] Case list page (contractor sees own cases only)

**Deployable:** full case creation flow, end to end, with ownership enforced.

---

# Sprint 4 — IFRS Parsing

- [ ] Deterministic PDF text extraction (no LLM)
- [ ] Statement detection (financial position, profit or loss, cash flows)
- [ ] Line-item normalization to canonical figures (`revenue`, `current_assets`, …)
- [ ] Multi-year extraction
- [ ] `FinancialStatement` table (one row per fiscal year) + parser provenance
- [ ] Parsing pipeline with real status (no fake progress)
- [ ] Extracted-figures review UI on the case page
- [ ] Unusable-document flagging
- [ ] Parser unit tests against sample statements

**Deployable:** uploaded statements produce structured, visible financial data.

---

# Sprint 5 — Financial Intelligence Engine

Pure TypeScript, fully unit-tested. The LLM is never involved.

- [ ] Ratio engine: liquidity, leverage, profitability, efficiency, cash flow, coverage (port from V1 `core/ratios.py`)
- [ ] Trend analysis (year-over-year, port from V1 `core/trends.py`)
- [ ] Risk flags (revenue swings, debt increase, margin deterioration, …)
- [ ] Execution capacity score (contract size vs revenue / liquidity / coverage)
- [ ] Risk score + band (transparent weighted rules, port from V1 `core/risk.py`)
- [ ] Confidence score
- [ ] `FinancialAnalysis` table
- [ ] Analysis UI: ratios, trends, flags, risk gauge
- [ ] Full unit test suite for all engine modules

**Deployable:** submitted cases show a deterministic financial analysis.

---

# Sprint 6 — AI Underwriter

The AI explains and drafts. It never calculates and never decides.

- [ ] Server-only LLM client (env-gated; deterministic template fallback when no key)
- [ ] Executive summary
- [ ] Underwriting memo (strengths, weaknesses, missing information)
- [ ] Recommendation derived deterministically from risk band (never by the model)
- [ ] Confidence surfaced with the memo
- [ ] Response cache (identical inputs → no repeat calls)
- [ ] Memo UI with provenance labels (computed vs AI-drafted)

**Deployable:** every analyzed case carries an AI memo; works with no API key.

---

# Sprint 7 — Risk Officer Workspace

- [ ] Officer queue: tabs (pending / all / issued), risk filter, search, pagination
- [ ] Review page: analysis panel + documents + audit timeline + sticky decision sidebar
- [ ] Explicit "Start review" action (no state change on page view)
- [ ] Approve / Decline / Request more information (mandatory note + confirmation dialog)
- [ ] Decision recorded as data (who, when, note) — not only in audit log
- [ ] Contractor sees decision status + requested-info notes
- [ ] Authorization: officers only; ownership checks on every data access
- [ ] Audit entries for every officer action

**Deployable:** an officer takes a case from queue to final decision.

---

# Sprint 8 — Letter of Guarantee Generation

- [ ] `Guarantee` entity + registry (reference `LG-YYYY-NNNNNN`, issue date, expiry from duration)
- [ ] Professional LG PDF (bank letterhead layout)
- [ ] Authenticated download route (no public URLs)
- [ ] Guarantee page + registry list
- [ ] Audit report per case (full trail, exportable)

**Deployable:** approved cases issue a downloadable Letter of Guarantee — MVP complete.

---

# Future (do NOT implement — architecture-ready only)

- [ ] Saudi Open Banking (`ExposureProvider` interface + mock only)
- [ ] SIMAH (`CreditBureauProvider` interface + mock only)
- [ ] Core Banking Integration
