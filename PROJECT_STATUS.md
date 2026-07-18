# PROJECT STATUS

> Living snapshot of where Daman V2 stands. Read this + `TODO.md` at the start
> of any session. **Last updated: 2026-07-18.**

## Product framing

Daman is an **AI-powered Corporate Underwriting Platform**, not an IFRS parser
— document extraction is one component. The product optimizes for delivering a
believable underwriting assessment *quickly*; during the MVP, speed and user
experience take priority over perfect financial statement reconstruction. The
Financial Intelligence Engine is fully deterministic; AI is used only for
document understanding (vision extraction) and underwriting explanation (the
memo), never calculation, and the Risk Officer always decides.

## Current focus

**The MVP (Sprints 0–5) is COMPLETE.** Sprint 5 was approved on 2026-07-07 and
Sprint 6 was cancelled the same day (the roadmap ends at Sprint 5). Since then,
post-MVP work (2026-07-08) has re-optimized the platform for the Express
Underwriting experience: two underwriting modes, a two-stage background
pipeline, a lazy AI memo, and hybrid GPT-Vision extraction — all detailed
below. All work is committed on `main`.

### Underwriting modes (current)

- **⚡ Express (default, `UNDERWRITING_MODE=express`)** — a meaningful
  assessment in seconds. Every uploaded statement is processed (newest first);
  the FIRST statement to complete flips the case ANALYSIS_READY and the rest
  enrich the analysis in the background. A scanned document that GPT-Vision
  cannot read fails fast (no OCR fallback); the AI memo is generated lazily on
  first officer open.
- **📊 Comprehensive (`UNDERWRITING_MODE=comprehensive`)** — production-grade.
  Same first-success orchestration, plus the OCR fallback for unreadable scans
  and the AI memo generated eagerly in the background. May take significantly
  longer per document.

### Post-MVP — RM workflow polish: live cross-role sync, timeline UX, package PDF (2026-07-18)

- **Live workflow sync (`WorkflowSync` + `/api/workflow/sync`).** The status
  column was always consistent in the database (guarded conditional writes),
  but a page another role already had open never learned about a transition —
  contractor, RM, and officer could look at different statuses until someone
  reloaded. Every workspace (both dashboards, the contractor case page, the
  review page) now renders an invisible watcher that polls a role-scoped
  fingerprint token (~5s, paused in hidden tabs) and refreshes the page the
  moment the state moves. Because `router.refresh()` intermittently fails to
  COMMIT in the Next 15.5 prod build (see TECH_DEBT), commit is verified via a
  `useEffect` on the token prop, with a typing-safe `location.reload()`
  fallback — convergence is guaranteed within ~10s.
- **Enterprise timeline & status chips.** `CaseTimeline` now derives a single
  highlighted "current" stage (pulse ring + In Progress chip), supports
  `skipped` stages (no Letter of Guarantee on a declined case; RM stage
  bypassed when the officer starts directly), and carries per-stage
  descriptions and actor names. Status/priority/document chips moved to tinted
  fills with dark-mode variants; both role timelines got clearer wording
  ("Submitted to Bank", "Risk Officer Review", decision outcome labels).
- **Underwriting Package PDF (`/api/cases/[caseId]/package-pdf`).** Bank-staff
  export of the complete case file via `renderUnderwritingPackagePdf`
  (pdf-lib, same letterhead conventions as the analysis/guarantee PDFs):
  company + contract particulars, Financial Intelligence verdict + pillars,
  full ratio tables, trends, risk flags, validation summary, AI executive
  summary + recommendation, RM assessment (revision, relationship context,
  suggested decision), Risk Officer decision, and a signature block — with
  page numbers, running headers, and a confidential footer. One template
  serves every stage: not-yet-reached sections print explicit "Pending" /
  "Not completed" placeholders. Download buttons on the review page header
  and the HTML package page; every export is audited
  (`officer.package_pdf_downloaded`). Verified end-to-end at four stages
  (before/after RM review, before/after decision) plus live cross-role sync
  with Playwright.

### Post-MVP — Historical statements never block Express Underwriting (2026-07-17)

A workflow audit against the Express philosophy ("only the latest audited
statement is required; historical years are optional trend inputs") found and
fixed three violations:

- **Currency check no longer sinks the case.** `CURRENCY_INCONSISTENT` used to
  reject EVERY fiscal year — a mis-read currency on an optional historical
  statement drove the whole case to PROCESSING_FAILED. The latest year now
  anchors the currency; only differing (historical) years are withheld.
- **Latest-statement gate.** The inverse rule is now enforced too: if the
  NEWEST uploaded fiscal year failed extraction while only older years
  succeeded, the case stops honestly instead of presenting a stale year as the
  current financial position (`case-processing-service`).
- **Honest Medium confidence for unread historical statements.** A historical
  document that failed extraction never reached the validator, so the officer
  saw "High Confidence". `assessmentConfidence`/`buildValidationReport` now
  take `unreadYears` (failed FINANCIAL_STATEMENT docs whose year no other
  document covered): confidence caps at 🟡 Medium, the Validation Report gains
  a "A historical statement could not be read" issue, and the review page,
  underwriting package, analysis-panel Trends section, and contractor partial
  banner all explain that trend analysis is limited — never as a product
  failure. The assessment, capacity, risk score, and memo are unaffected.

Everything else already conformed (first-success readiness, partial
assessments, per-document retry, single-year trends messaging).

### Post-MVP — KYC questionnaire, structured contracts, composite grade, company history (2026-07-16)

The submission flow was deepened per the client's "Platform Edits
Specification" (curated: every added field feeds a deterministic score, a
computed flag, or an exposure calculation — free-text-only and
SIMAH-dependent items were dropped/deferred; **no pre-filling anywhere** by
explicit decision). 232/232 tests, typecheck + lint + prod build clean.

- **Five-step wizard.** New Step 2 "Profile & Track Record" (KYC): company
  profile (CR issue date — age is derived, never self-banded — group,
  ownership change, Nitaqat, litigation), track
  record (projects band, terminations, guarantee-ever-called,
  same-type experience), workload (running projects, backlog, outstanding
  guarantees across banks, hiring), conduct (main bank, incidents,
  auditor tier, funding source). *(2026-07-17: contractor classification, CR
  activities, GM name/experience, largest completed project, and equipment
  plan were removed from the flow; qualitative and contract-risk weights
  were rebalanced proportionally and the jump-risk factor/cap retired.)* Stored per case in `CaseQualitative` (1:1) —
  answers are versioned by construction; drift between a company's cases is
  itself a signal.
- **Structured contract terms** on `ContractDetails` (all nullable for legacy
  rows): role/back-to-back, award method, prior beneficiary contracts,
  advance %, billing cycle, retention %, payment period, required bond % +
  validity + first-demand + extend-or-pay, LD rate/cap, mobilization weeks,
  key suppliers, expected gross margin. Free-text payment terms retired
  (column kept nullable for old cases); optional signed-contract PDF upload
  (docType `CONTRACT`, upload only — no authenticity verification this
  phase). Expected first invoice date is *derived*, never asked.
- **Composite grade** (`overall-grade-service`): 50% financial + 30%
  qualitative (`qualitative-score-service`) + 20% contract risk
  (`contract-risk-service`); absent pillars renormalize (legacy cases grade
  exactly as before). **Hard caps** (guarantee called / conduct incidents /
  Nitaqat Red → MANUAL_REVIEW at best; >3× jump → conditions at best) bound
  the recommendation of record, never any score. New deterministic
  cross-checks/flags: sector mismatch, experience gap, capacity headroom
  ((backlog + contract)/revenue), guarantee burden vs equity (the
  within-Daman over-issuance check), cash-gap coverage, thin margin, margin
  realism vs audited gross margin, bond-% consistency, bond tail risk.
  All thresholds in `lib/finance/thresholds.ts` (QUALITATIVE, CONTRACT_RISK,
  PILLARS, HARD_CAPS). Headline/queue/priority/memo policy now read
  `report.overall`; prompt bumped to **v5** (companyProfile + contract
  structure + pillars + hardCaps in the input snapshot).
- **Statement reliability.** Per-upload Audited/Reviewed/Management
  declaration (`Document.statementType` → `FinancialStatement.statementType`);
  the WEAKEST statement bounds the grade's confidence label — never a score
  (that would double-count the auditor-tier component).
- **Company as parent entity.** `company-history-service` derives (never
  duplicates) a company's full record from its cases; new bank-side page
  `/companies/[id]` (stats: active/pending exposure, guarantees; full case
  table) linked from the review workspace; Insight Chat context now includes
  the company's other contracts/guarantees/outcomes for portfolio questions.

### Post-MVP — Demo-feedback change set: RM-led workflow, PDF export, coverage fix (2026-07-16)

Thirteen demo-feedback items, implemented and verified end-to-end (24-check
Playwright walkthrough across contractor → RM → admin, zero console errors;
205/205 tests, typecheck + lint + prod build clean):

- **RM-led review.** The bank persona is now the Relationship Manager: both
  seeded bank logins are `RELATIONSHIP_MANAGER` (the Risk Officer has no
  account — the schema/decision path keeps `RISK_OFFICER` for the future).
  The RM reviews, records a **suggested decision** (`RmSuggestedDecision`,
  same vocabulary as officer decisions, captured transactionally with the
  routing), and "Submit to Risk Officer" moves the case to `RM_REVIEWED` —
  labeled "Sent to Risk Officer" (no real send; the officer stage is
  fictional for now). Admin retains the decision/issuance path. Bank-staff
  READ gates (`getGuaranteePdf`, `getDocumentForDownload`) now include RMs.
- **Guarantee amount removed as an input.** The wizard takes only the ratio;
  the amount is always rederived server-side (`contractValue × ratio / 100`)
  and previewed live. Expected payment terms became required.
- **IFRS years on request.** The documents step starts with only the latest
  fiscal year; "+ Add Year N" reveals earlier slots one at a time (6-year cap,
  computed from the current date).
- **Financial-company applicants.** Sectors now include Banking & Financial
  Services, Fintech & Digital Payments (BNPL — e.g. Tamara), and Insurance.
- **Contractor surface reduced.** The contractor-facing Financial Analysis
  page is gone (submit + track only); bank analysis stays internal. The
  REQUEST_INFO decision now revalidates the contractor's case paths and is
  shown prominently (message + timestamp) on their case page.
- **Company registration fix.** A second user entering an existing CR number
  joins that company instead of erroring; identity lock still protects
  submitted cases.
- **Coverage/liquidity data fix.** The parser reads the cash-flow
  "Depreciation and amortisation" add-back; the engine derives EBITDA
  (operating income + D&A, only when D&A is known) so EBITDA margin, DSCR and
  EBITDA coverage populate. Current-asset/liability subtotal captions relaxed
  (`Current assets` accepted as a complete caption). Demo statement fixtures
  now print the D&A line and the three canonical cases were re-seeded — all
  cash-flow/coverage/working-capital fields show real values (bands
  unchanged: 2/EXCELLENT, 19/LOW, 92/CRITICAL).
- **Admin case management.** Audited admin-only Edit (full contract form,
  amount rederived) and Delete (refused while an issued guarantee exists;
  storage cleanup best-effort) dialogs on the review page.
- **Financial analysis PDF export.** `GET /api/cases/[caseId]/analysis-pdf`
  (bank-staff only, audited) renders the deterministic report via pdf-lib —
  Alinma logo letterhead (`public/bank-logo.png`, traced into the serverless
  bundle via `outputFileTracingIncludes`), verdict row, full ratio tables per
  fiscal year, risk flags, no-AI footer. "Export PDF" button on the review
  page's Financial Intelligence section.
- **Insight Chat as a floating widget.** Fixed-position launcher icon
  (bottom-right) opening a resizable panel (expand/collapse); the page stays
  fully scrollable/navigable while a response streams; a brief randomized
  "thinking" pause (700–1100 ms, bouncing dots) precedes the first token.
- Migration `20260716105627_express_rm_officer_and_liquidity_fixes`.

### Post-MVP — Banking-grade number presentation (2026-07-15)

Presentation only — no engine, model, or validator logic touched.

- **Money inputs group as you type.** `MoneyField` + `lib/money-input.ts`: the
  applicant sees `6,000,000` with a `SAR` stamp inside the field; the form still
  holds `6000000`, so zod (`/^\d{1,16}(\.\d{1,2})?$/`) and Prisma.Decimal are
  unchanged — verified by driving a real browser and reading the stored row back
  (`120000000`), including that the "guarantee cannot exceed contract value"
  rule still fires. The caret is measured in significant characters (digits and
  the point) rather than raw offsets, so it never bounces to the end when a
  separator appears — proven by typing mid-number and asserting the caret index.
- **The validator's findings now read like banking, not debugging.** They quoted
  raw Decimals: `assets (50000000.00) do not equal liabilities + equity
  (35000000.00)`. Now: `total assets of SAR 50,000,000 do not equal liabilities
  plus equity of SAR 35,000,000 — a gap of SAR 15,000,000`. Amounts are no longer
  wrapped in parentheses either, which collided with accounting negatives:
  `Revenue reads (SAR 2,500,000), which cannot be negative` is now unambiguous.
  Currency is honoured (`USD 50,000,000`). Message wording only — every severity
  and every decision to raise a finding is untouched, and all tests still pass.
- **`formatPercentValue` added** for a percentage that IS already a percentage
  (`"10.00"` → `10%`). Distinct from `formatPercent`, which scales a fraction —
  routing a stored 10 through that one would report `1000.0%`. Contract summaries
  now use it and render money `tabular-nums`.
- **Helper text on every money field** ("The amount the bank would guarantee.
  Cannot exceed the contract value.").
- 15 new tests (`tests/ui/money-input.test.ts`), including the non-breaking space
  `Intl` puts between the currency code and the amount (deliberate: "SAR" must
  never wrap away from its number).

### Post-MVP — Assessment Confidence + Validation Report (2026-07-15)

The Financial Integrity Validator was correct but invisible: an officer could
read a normal-looking assessment with no idea a year had been withheld. Every
assessment now states how far it can be trusted. Presentation and workflow
only — the validator, the engine and the underwriting model are untouched.

- **Assessment Confidence** (🟢 High / 🟡 Medium / 🔴 Low) sits directly beneath
  the recommendation it qualifies, on the review desk, the contractor's
  Financial Intelligence page, and the printed Underwriting Package header (a
  package is filed and re-read later — the caveat must travel with it).
- **Validation Report** whenever a warning or blocking finding exists: Summary /
  Confidence / Statements Affected (Reviewed vs **Excluded**) / Assessment Based
  On / Issues Found / Recommended Action. Plain headings come from a code→copy
  map; the validator's own message supplies the figures. A test asserts every
  code the validator can emit has a heading, and an unknown code falls back to a
  neutral one rather than leaking the identifier.
- **Low confidence replaces the verdict** with "Assessment could not be
  completed" and drafts **no memo** — `analysisReady` now means "there is a
  trustworthy assessment to explain", not merely "rows exist", so the memo no
  longer auto-fires and spins on a blocked case, and the Generate button is
  withheld. An AI narrative over figures the bank does not trust is worse than
  silence.
- **Two audiences, two vocabularies.** The officer gets the arithmetic; the
  applicant gets `contractorNotice()` — no figures, no internals, and explicit
  that it is the document that could not be verified, "not about your company".
  Previously the contractor was shown the validator's raw balance-sheet
  arithmetic verbatim.
- **Historical data reconciled.** `scripts/reconcile-case-states.mts` (read-only
  by default, `--apply` to act) reprocesses cases whose status promises an
  assessment the engine will not produce, through the real retry path — it never
  writes a status itself. Three cases fixed: UC-2026-000068 (ANALYSIS_READY over
  an empty analysis) and UC-2026-000001/000033 (runs stuck RUNNING for 170h).
  Decided and issued cases are never touched. Every case is now consistent.
- 13 new tests (`tests/finance/confidence.test.ts`); all four scenarios (High,
  Medium-warning, Medium-partial, Low) verified end-to-end in the browser as
  both officer and contractor. Stage 1 unchanged at ~2.5s.

### Post-MVP — Financial Integrity Validator: the engine only sees validated data (2026-07-15)

A deterministic gate between extraction and the Financial Intelligence Engine
(`src/services/finance/financial-integrity-validator.ts`, documented in
`docs/FINANCIAL_ENGINE.md`). It answers one question — *can these numbers be
what the auditor actually printed?* — and never *is this company creditworthy?*

- **Why it was needed.** A live case (STC Arabic annual report) sat at
  ANALYSIS_READY having extracted exactly ONE figure — revenue of SAR 75.9bn,
  with all 21 other figures absent — and the engine reported **risk band LOW,
  score 17/100** with every ratio `null`. A fabricated assurance handed to a
  Risk Officer. That case is now correctly blocked.
- **Severity model.** BLOCKING (the figures cannot all be from one printed
  statement) / WARNING (suspicious but possibly real — continue with reduced
  confidence) / INFO. A BLOCKING finding withholds one **fiscal year**, not the
  case, mirroring the "one bad document never fails the case" rule; only when
  no year survives does the case stop as `PROCESSING_FAILED` at
  `FINANCIAL_ANALYSIS`, with the arithmetic reason and next step in the message.
- **Checks.** Missing CORE figures; impossible negatives; `A ≠ L + E` beyond a
  configurable tolerance (naming the "Total equity and liabilities grand total
  read as a component" signature when equity == assets); subtotal > total;
  currency/scale inconsistency; duplicate/gapped fiscal years; implausible
  ratios and net-income-vs-revenue.
- **Distress is data, not error.** Negative equity, net losses and negative
  operating cash flow all pass — they describe the applicant a bank most needs
  assessed. `WEAK_PROFILE` passing is a permanent test.
- **The gate lives at the engine's door** (`buildFinancialIntelligence`), which
  has 7 callers across services and pages; a check in any one of them would
  leave the others computing on impossible figures. It returns `null` when
  nothing survives — the existing no-data contract every caller already handles.
  The pipeline also runs it explicitly to record the verdict in the audit log
  (`case.integrity_checked`).
- All bounds live in `thresholds.ts` under `INTEGRITY`, deliberately generous:
  wrongly rejecting a real applicant is worse than passing an odd-looking one.
- 22 new tests (`tests/finance/integrity-validator.test.ts`). Verified against
  every live case: 6/7 keep their assessment, the STC case is blocked. Stage 1
  unchanged at ~2.4s (target ≤3s).

### Post-MVP — Label vocabulary: caption variation across real auditors (2026-07-15)

The normalizer mapped only the "happy" wordings the fixtures printed. Measured
against an 85-caption battery drawn from real Saudi/IFRS filings: **73% → 99%**.

- **Loss wording was entirely absent** — `Loss for the year`, `Net loss`,
  `(Loss) / profit for the year` and `Profit / (loss) for the year` (the most
  common IFRS bottom-line caption, used by profitable companies too) all mapped
  to null. `netIncome` is a CORE figure, so the applicants a bank most needs to
  assess were exactly the ones whose bottom line silently vanished.
- **A cascade false positive.** With `Revenues` (plural) unmapped, the first
  *sales*-ish caption won instead — on a real loss-making statement the engine
  received **revenue = −2,500,000**, the "Sales and marketing expenses" line,
  and the validator of the day reported no errors.
- **Grand totals claimed as subtotals.** `Total equity and liabilities` →
  `totalEquity`. Under equity-before-liabilities presentation (IFRS-legal),
  debt-to-equity computed **1.67 against a true 0.67**.
- Guards against overcorrection: a bare outcome word needs a bottom-line
  qualifier (`Income tax expense`, `Loss on disposal`, `Profit before zakat`
  stay rejected); `Sales and marketing expenses` excluded from revenue; combined
  identity captions declined in English and Arabic (new `arNot` disqualifier,
  since Arabic matching is unanchored substring containment).
- `Loans and borrowings` deliberately left unmapped: it appears under both
  current and non-current sections, and without section context mapping it is a
  guess. Absent beats wrong.
- 15 new tests (`tests/ifrs/label-vocabulary.test.ts`).

### Post-MVP — RM memo hydration (2026-07-15)

The RM's executive-summary textarea initialised with `useState(defaultSummary)`
and never received the lazily-generated AI draft: the background refresh
re-rendered the server component with the draft, but React preserves client
state, so the box stayed empty until a manual reload. The first RM to open any
fresh case saw a blank field while the full memo rendered beside it — and a
saved revision kept only their addendum, discarding the AI draft. Now hydrated
via a pristine-guarded effect that never clobbers the RM's own words.

### Post-MVP — Final end-to-end verification pass (2026-07-15)

Full lifecycle driven through a real browser (Playwright, prod build) across
all four roles and both viewports: Contractor wizard → upload → Express
processing → Financial Intelligence → Decision Intelligence → RM review →
Risk Officer decision → Letter of Guarantee issuance. Typecheck, lint, build,
and all 205 unit tests pass; zero console/page errors across the full walk,
including the company-identity lock and the `COMPANY_NAME_MISMATCH` flag
shipped earlier today.

- **Fixed: `ProcessingDashboard` failed React hydration (#418) while a case
  was actively processing.** `now` seeded via `useState(() => Date.now())`,
  which runs once during SSR and again independently during client hydration
  — two Date.now() calls that never agree desynced the live elapsed-time
  readout for any still-running stage, forcing React to discard and
  regenerate the whole tree on every page load caught mid-processing (a real
  path: a contractor refreshing during the ~5s Express window). Fixed by
  seeding `now` from `initial.updatedAt` (already serialized identically to
  server and client) and correcting to real wall time on mount instead of
  calling `Date.now()` in the render that gets hydrated. Verified with 12
  rapid reloads against a live-processing case: zero hydration errors.
- Confirmed as expected/non-actionable: the R2 bucket CORS console error on
  local direct-to-storage uploads (documented one-time dashboard prerequisite,
  [[daman-upload-architecture]] — the app falls back to the through-server
  path automatically) and blank `.scroll-reveal` regions in full-page
  screenshots (TECH_DEBT #27 — Chromium `animation-timeline: view()` doesn't
  run during headless full-page capture; real scrolling renders correctly).

### Post-MVP — Real-statement extraction + disclosure-aware analysis (2026-07-15)

Root-caused and fixed "the analysis shows No data even though the figure is
printed in the statement" using a real audited big-four FY2025 report (Tamara
Finance, PwC):

- **Vertical (cell-per-line) PDF layouts now extract deterministically.** Many
  real audited PDFs emit every table cell as its own text line (label / note /
  one amount per year), which the per-line parser could not pair — the text
  pass found 0 figures and production silently fell back to GPT-Vision, which
  only requested 10 headline fields. The line extractor now reflows vertical
  rows (`reflowVerticalRows`), reads fiscal years from cell-per-line headers
  (`headerRegionYears`), keeps printed nil cells ("-") aligned to their year
  column, and drops compound note references ("13, 15"). Verified on the real
  PDF: **14 exact figures per fiscal year from the trusted text layer**, case
  ANALYSIS_READY in ~4.5s, no AI involved.
- **Vocabulary:** "Total revenue", "Funding cost" (→ interest expense),
  "Consumer/financing receivables", "Purchase of property and equipment"
  (no "plant"), singular "investing activity", possessive "Total
  shareholder's equity". On statements of cash flows a repeated caption now
  resolves to the LAST printed subtotal (the statement total), fixing OCF on
  statements that print an intermediate "Net cash used in operating
  activities" before EOSB/finance/tax payments.
- **Vision fallback upgraded** from 10 headline fields to the full canonical
  set (gross profit, interest expense, receivables, capex, all three cash-flow
  totals…), with prompt guidance for repeated cash-flow subtotals and
  order-of-liquidity balance sheets.
- **Disclosure-aware analysis (`report.disclosures.orderOfLiquidity`).** A
  balance sheet presented in order of liquidity (banks/finance companies)
  publishes no current/non-current split — liquidity, OCF-ratio, and
  working-capital metrics are **not disclosed**, not missing. The drivers
  cards badge "Not disclosed" with an explanatory footnote, the Liquidity and
  Working Capital ratio tables carry the same caption, and the AI memo prompt
  is told not to request a current ratio from the applicant.
- **Trend chart fixes:** the y-domain now always includes the zero baseline
  (an all-negative series — e.g. two loss-making OCF years — previously
  collapsed the smaller bar to zero height); value labels always sit above the
  bar's top end (they used to clip inside/below negative bars); when working
  capital is undisclosed, the Total Equity trend takes its chart slot instead
  of an empty card.
- Regression tests added for vertical layouts (fiscal-year header, nil-cell
  alignment, last-subtotal-wins); full suite 140/140, lint and build clean.
- **Note for the demo:** completed extractions are cached per document —
  existing cases keep their old (vision-era) figures. Upload the statement to
  a NEW case to see the full deterministic extraction.

### Post-MVP — Demo Day UI/UX polish (2026-07-15)

Final pre-demo polish pass — no feature, workflow, or engine changes.

- **Wizard Step 2 first-click validation fixed.** Root cause: react-hook-form
  can only focus fields it holds a ref for; the Controller-driven Base UI
  selects have none, so a form whose first errors were selects showed messages
  far off-screen with no scroll or focus (and RHF's own focus jump was abrupt).
  Both wizard forms now use `shouldFocusError: false` + a shared
  `focusFirstInvalidField` (form-errors.ts): errors render immediately, and the
  first invalid field — input or select, in DOM order — is smooth-scrolled to
  center and focused. Error messages animate in.
- **Wizard Step 3 gated.** "Continue to Review" is disabled until at least one
  statement is uploaded, with an amber notice explaining why (upload-aware
  copy); the stepper equally refuses to open Review & Submit without one.
- **Motion system** (globals.css): `rise-in` / `rise-in-stagger` entrance
  utilities, `grow-in` meter fill, `page-enter` route transition (via
  `(app)/template.tsx`), and `scroll-reveal` scroll-driven section fades
  (`@supports animation-timeline: view()` — progressive enhancement, absolute
  160px range end so tall sections never sit half-transparent). All utilities
  are compositor-only (opacity/transform) and disabled under
  `prefers-reduced-motion`.
- **Micro-interactions:** KPI scores and dashboard stats count up
  (`AnimatedNumber`, rAF, reduced-motion aware), trend charts animate on first
  render, skeletons gained a shimmer sweep, upload/processing progress bars
  ease, dialog open/close softened, processing detail expand animates.
- Verified end-to-end with Playwright: all four roles, 13 pages, zero console
  errors; scroll-reveal confirmed to fully reveal on scroll and on jump-to-end.

### Post-MVP — Company identity integrity (2026-07-15)

Root-caused a demo incident where the Risk Officer's case showed an excellent
"Tamara" assessment while the contractor's Tamara case showed BBB with 5 risk
flags: the wizard's Step 1 renamed the shared Company row in place
("Rawabi Contracting Co." → "Tamara"), retroactively relabeling an older case
(built from the Rawabi demo statements) as a Tamara case in every live view.
Two deterministic fixes, no schema change:

- **Identity lock**: `upsertCompanyForUser` refuses changes to the company
  name or CR number once any non-DRAFT case references the company (contact
  and profile fields stay editable), with an explanatory error. Historical
  underwriting records keep the identity they were decided under.
- **COMPANY_NAME_MISMATCH risk flag**: the IFRS parser already extracts the
  company name printed on each statement; `detectCompanyMismatchFlags`
  (HIGH severity) now fires on the analysis, review, and package pages and in
  the memo inputs whenever the statement's company clearly differs from the
  case applicant (normalized containment matching, so "Tamara" matches
  "TAMARA FINANCE COMPANY"; unreadable names are never flagged). The flag is
  display/memo-only — risk & capacity scores remain purely financial.

### Post-MVP — Reliable full-size statement uploads (2026-07-14)

Root-caused why real audited annual reports "sometimes fail immediately" while
small PDFs upload fine: **Vercel Functions cap request bodies at 4.5 MB**
(413 `FUNCTION_PAYLOAD_TOO_LARGE`, a platform constant, not configurable) —
most real annual reports are 5–10 MB, and the 413's non-JSON body collapsed
into the client's generic "Upload failed. Please try again."

- **Direct-to-storage uploads**: `POST …/documents/presign` validates the slot
  and mints a 10-minute presigned R2 PUT URL; the browser PUTs the bytes
  straight to storage with live progress; a JSON finalize call re-reads the
  object server-side (size bounds + `%PDF-` header — client claims are never
  trusted), then registers the Document. Failed verification deletes the
  object. Requires a bucket CORS rule (README/Deploying); without it the
  client falls back automatically to the multipart route.
- **Downloads** are served via 60-second presigned GETs after the existing
  access check + audit (Vercel also caps RESPONSE bodies at 4.5 MB).
- **Honest errors everywhere**: non-JSON platform errors map to status-specific
  messages (413/timeout/network/5xx); presign/finalize fetches time out rather
  than hanging at 0 %; a failed upload keeps the chosen file and offers
  in-place "Try again" — no wizard restart.
- **Mobile MIME fix**: Android pickers hand PDFs over with an empty/generic
  type — shared `looksLikePdf` (lib/case-constants) accepts extension-backed
  PDFs; the server byte check stays authoritative (now tolerant of the header
  anywhere in the first 1024 bytes, matching real-world exporters).
- **Structured `[upload]` logs**: one line per request with per-stage
  durations (auth/parse/verify/save) for production diagnosis.
- **Verified** with real Saudi listed-company PDFs (STC 2024 annual report +
  consolidated financial statements; slices at 5.7/8.2/9.55 MB): 10/10 browser
  scenarios pass on desktop + Pixel 7 + iPhone 14 emulation, including a
  simulated Vercel 413, presign-outage fallback, oversized-file rejection, and
  a real-R2 end-to-end run (direct PUT of 9.55 MB verified against the live
  bucket). 130/130 unit tests; build/typecheck/lint clean.

### Post-MVP — First-success orchestration: the case is the product (2026-07-14)

Architecture review + redesign of the processing orchestration around corporate
underwriting (not document processing). Root causes found and fixed:

- **Express no longer slices to the latest document.** Previously
  `processCaseDocuments` read ONLY the newest statement in express mode and
  marked the rest SKIPPED — if that single document failed (scanned + vision
  miss), the case went PROCESSING_FAILED while perfectly usable older
  statements sat unread. Now every statement is processed in both modes and a
  case fails only when NO document yields figures. `SKIPPED` is legacy-only
  (healed automatically on retry).
- **First-success readiness.** The case flipped ANALYSIS_READY only after ALL
  documents settled — the slowest/failed document held the case (and the
  RM/officer queues, which key on status) hostage. Now the incremental rebuild
  reports each batch of persisted statements to the orchestrator
  (`onStatements`), and the FIRST non-empty deterministic report flips the case
  ANALYSIS_READY immediately; remaining documents continue in the background
  and only enrich.
- **A finished analysis is never taken away.** A fault after readiness fails
  the JOB (retryable) but leaves the case ANALYSIS_READY
  (`failJob({ keepCaseStatus })`); previously any late fault regressed the case
  to PROCESSING_FAILED.
- Retry/resume semantics unchanged: per-document checkpoints, sha-keyed reuse,
  no repeated GPT calls. Docs updated (`docs/ASYNC_PROCESSING.md`).

### Post-MVP — Framework conformance: RM stage + Letter of Credit + SLA metric (2026-07-14)

Aligns the product with the Daman framework document (except the 48h SLA — the
demo competes on seconds). All verified live (prod build, Playwright, real
Neon + R2 + pipeline):

- **Relationship Manager role + review stage (framework step 8).** New
  `RELATIONSHIP_MANAGER` role (`rm@daman.local`, Salman Alghamdi) and case
  status `RM_REVIEWED`. The RM shares the bank read paths (queue, case detail,
  notes, memo generation) via `getBankUser`; decisions/issuance stay
  officer-only. The RM refines the AI memo through **append-only, versioned
  `MemoRevision` rows** (the AI original is never mutated), adds relationship
  context, and routes the package (`ANALYSIS_READY → RM_REVIEWED`,
  `rmReviewerId`/`rmSubmittedAt`, audited). The officer's review page shows an
  "RM Assessment" panel above the untouched AI memo and an "RM Review"
  timeline entry. Deliberate rule: `canStartReview` accepts BOTH
  `ANALYSIS_READY` and `RM_REVIEWED` — the RM stage is a quality pass, never a
  bottleneck (demo never blocks on a fourth persona).
- **Letter of Credit** as the fifth guarantee product, plus a per-product
  `GUARANTEE_TYPE_FOCUS` map (framework §3) shown as a wizard hint and passed
  to the memo prompt as `contract.analysisFocus` — **prompt v4** (narrative
  emphasis only; engines stay product-agnostic). Existing demo memos remain
  valid v3 output; regenerations use v4.
- **SLA / north-star metric (framework §4.16):** "Avg. Time to Assessment"
  stat card on the bank dashboard — live average of `queuedAt → completedAt`
  over COMPLETED processing jobs (showed "4s across 4 cases" in verification).
- Migration `20260714085013_rm_review_stage_and_letter_of_credit`; base seed
  now 4 users. 125/125 tests, typecheck + lint + prod build clean; full RM →
  officer flow and LC wizard/pipeline walked in a real browser with zero
  console errors (verification cases cleaned up afterwards).

### Post-MVP — Demo-day release candidate: partial assessment + final polish (2026-07-14)

Final pre-demo hardening pass. Reliability fixes, no engine or schema change:

- **One failed document never fails the case (PARTIAL ASSESSMENT).** Previously
  a single unreadable statement failed the whole case even when siblings had
  verified figures. Now: as long as ≥1 statement was verified, the pipeline
  proceeds to Financial Intelligence and ANALYSIS_READY; the job COMPLETES and
  the failed document keeps its own FAILED state + retry. The dashboard shows
  an honest amber "assessment uses the statements we could verify" notice with
  the per-document retry. `retryProcessing` now also accepts a COMPLETED job
  that has a FAILED document (`partialRetry`) — resume reuses every checkpoint.
  **Verified live** (`scripts/verify-partial-assessment.mts`, comprehensive
  mode, real Neon + R2 + OpenAI): good+bad docs → ANALYSIS_READY / COMPLETED /
  bad doc FAILED individually; retry allowed; resume reused the good document's
  extraction checkpoint byte-for-byte (identical `completedAt`).
- **No misleading queue countdown under a dead job**: a QUEUED document under a
  FAILED/COMPLETED job now reads "Waiting to process — resume processing to
  continue" instead of a ticking "starting in ~1s" that never comes true.
- **Lazy-memo silent-failure fix**: when the officer-open auto-refresh window
  (8×3s) exhausts without a memo, the panel now says so (amber notice pointing
  at "Generate AI Analysis") instead of pulsing "Preparing AI analysis…"
  forever.
- **Prompt v3**: growth/trend changes reach the model as signed percent
  strings ("+20.0%", "−1.2pp") instead of raw fractions (0.2) — the memo can
  no longer misquote growth figures. Cache-invalidating bump; tests added.
- **Ratio-table clipping fixed**: label cells may wrap (`whitespace-normal`),
  so the FY columns in "Cash Flow & Coverage" / "Working Capital & FCF" are
  never pushed out of view in the review center column (was clipped at 1440px).
- **Demo data reset**: base seed + `seed-demo-cases.mts` re-run — junk test
  cases removed, the three canonical cases rebuilt (Rawabi strong 95/2,
  Nimah moderate 68/19, Faisal weak 13/92 High) and all three memos generated
  live on officer open (openai · gpt-4o-mini · prompt v3, consistent company
  names). OpenAI key + gpt-4.1 vision model verified live with quota.
- **Verified**: 122/122 tests, typecheck + lint + production build clean; full
  Playwright walkthrough (contractor/officer/admin, landing, wizard, analysis,
  review, package) with zero console/page errors.

### Post-MVP — Per-document processing lifecycles (2026-07-11)

The dashboard used to show one case-wide stage list (and a bare "Queued");
now every uploaded statement renders its OWN independently-updating lifecycle
(GitHub-Actions style). Documents were already extracted in parallel
(concurrency 3) with per-document checkpoints — this pass made that
observable and made partial progress land immediately:

- **Schema**: `Document.processingEvents` (Json) — per-run event log
  `[{stage, startedAt, note?}]` (PREPARING → READING → DETECTING →
  EXTRACTING → COMPLETED/FAILED; terminal events ride the synchronous
  checkpoint write). New `DocumentProcessingStatus.SKIPPED`: Express marks
  older uploads SKIPPED explicitly ("Not needed — Express uses your latest
  audited statement") instead of leaving them "Queued" forever. Migration
  `20260711090303_document_processing_lifecycle`.
- **Incremental Financial Intelligence**: FinancialStatement rows are rebuilt
  the moment EACH document completes (serialized, batch re-sorted
  newest-first so the final state is order-independent) — the underwriting
  headline appears when the FIRST statement lands while the rest keep
  processing. On a partly-failed run the completed documents' rows stay.
- **Poll payload** (`ProcessingView`) now carries `documents[]` (status,
  events, human-readable error from the extraction row); the case page seeds
  the same data into the initial render.
- **Dashboard**: per-document rows with live stage, note, progress bar,
  ticking elapsed (1s ticker between polls), estimated remaining, queue
  position + start estimate while queued (never a bare "Queued" — the job
  label is now "Starting analysis"), per-document "Retry this document" on
  failure (checkpoints make retry per-document), and an expandable per-stage
  timing breakdown. Case-wide steps (Financial Intelligence, AI memo) stay
  below the document list.
- Pure derivations (`deriveDocumentViews`) in `lib/processing.ts`,
  exhaustively tested; `STAGE_LABELS.FINANCIAL_ANALYSIS` renamed to
  "Financial Intelligence".
- **Write-race fix found by live verification**: fire-and-forget progress
  writes could commit AFTER the terminal COMPLETED/FAILED write on a slow
  link and clobber it (document stuck at "PROCESSING" forever). Per-document
  progress writes are now serialized through a chain the terminal writer
  drains first.
- **Verified live** (real Neon + R2, mock LLM): (A) comprehensive ×3 docs —
  all three ran their own PREPARING→…→COMPLETED lifecycles in parallel and
  FinancialStatement rows were observable WHILE the job was still RUNNING
  (incremental FI); (B) express ×2 docs — older statement SKIPPED, latest
  COMPLETED; (C) unreadable doc — FAILED at the named stage with the
  human-readable reason persisted. 120/120 tests, typecheck + lint +
  production build clean.

### Post-MVP — Express extraction redesign: OCR removed from Express (2026-07-11)

The fundamental bottleneck was the OCR *fallback*: tesseract.js (ara+eng, 200
DPI, 2 workers, up to 10 pages) runs **150–300s per scanned document** — and
its Arabic numeric tables usually fail the trust gate afterwards, so minutes
were spent producing a blocking error. It was entered whenever GPT-Vision
returned null (quota errors, timeouts, bad JSON). Express now never OCRs:

- **Express pipeline**: MuPDF text pass locates statement pages (no OCR, no
  full-document reconstruction) → if <5/8 core figures, GPT-Vision reads ≤5
  statement-page images (`VISION_MAX_PAGES` 6→5) with the 10-field
  minimum-JSON prompt → figures feed the deterministic Financial Intelligence
  Engine unchanged. If vision yields nothing for a scanned doc, the document
  **fails fast (~2s) with an honest message** (retry is cheap — checkpointed).
  OCR remains available in Comprehensive only, still watchdog-budgeted.
- **Vision model split from the memo model**: new `OPENAI_VISION_MODEL`
  (default `gpt-4.1`); on 404 the provider retries once on `gpt-4o`
  automatically. The memo stays on `OPENAI_MODEL` (gpt-4o-mini). Measured
  live: gpt-4.1 read the scanned fixture in **3.1s** (vs 6.2s on gpt-4o-mini)
  at 3,593 input tokens (vs ~110,800 — mini inflates image tokens ~33×).
- **Verified end-to-end** (real OpenAI + Neon): scanned doc + mock provider →
  FAILED honestly with zero OCR; scanned doc + real provider → COMPLETED /
  ANALYSIS_READY, extraction wall 5.1s in a cold child process (storage 0.4s,
  raster 0.3s, vision 3.1s, engine 0.2s — warm server lands ≈5s; digital PDFs
  stay ~1–2s, no network). 113/113 tests, typecheck + lint + build clean.

### Post-MVP — Processing orchestration fix: checkpointed resume + live stage log (2026-07-11)

Root cause of "OpenAI succeeds but the contractor never sees results": the
extraction result (including the paid GPT-Vision response) was persisted as a
**deferred, fire-and-forget write** settled only at the very end of the run —
any dev-reload/serverless kill mid-run lost it, the job sat RUNNING until the
stall detector fired, and Retry re-ran everything (re-billing the model).
Compounding it, `VISION_TIMEOUT_MS=12s` aborted real multi-image vision calls
client-side while OpenAI still billed them. Smallest-change fixes, all verified
end-to-end with a real kill/resume test (scanned PDF → SIGKILL right after the
checkpoint → auto-resume → COMPLETED, exactly 1 vision call, 1 memo):

- **Synchronous extraction checkpoint** (`extraction-service`): the extraction
  row + document status commit before the pipeline proceeds. A resumed run
  reuses it (`resume_checkpoint`) — no re-read, no re-parse, no second vision
  call. Memo resume guard: an existing `DecisionIntelligence` row (or an
  identical `inputHash`) is never regenerated.
- **Retry = Resume** everywhere: manual retry re-queues without clearing
  checkpoints; the poll route auto-resumes a dead RUNNING job (heartbeat quiet
  > 90s, attempt-capped ×5). Runs heartbeat every 15s so a LIVE long stage is
  never mistaken for a stall. Button/copy now say "Resume Processing".
- **Live stage execution log**: `CaseProcessing.stageEvents` (Json, migration
  `20260711001206`) — `[{stage, startedAt, note?}]` appended as each stage
  begins; the dashboard derives per-stage durations (`deriveStageTimings`,
  pure + tested) and renders `✓ 0.8s` / `⟳ Running… 6.2s` rows with in-stage
  notes ("Reading scanned statement pages with AI vision").
- **Timeout sanity**: `VISION_TIMEOUT_MS` 12s → 60s (never abort a billed
  call into the slower OCR path); new `OCR_FALLBACK_BUDGET_MS` (120s) watchdog
  fails a document honestly instead of leaving the job RUNNING forever.
- **Vision prompt trimmed to the 10-field minimum underwriting set** (strict
  JSON only, extended fields dropped) + latency instrumentation
  (`[vision-extraction] measured`: openaiMs / validationMs / tokens).
  Measured: OpenAI ~6.2s for 3 scanned pages; JSON validation ~2ms; DB
  checkpoint ~0.4s — the model call is the whole bottleneck, everything else
  is noise. Express Stage 1 on resume: ~1.3s. 110/110 tests, typecheck clean.
- **Fixed a pre-existing production-build break** (present at HEAD before this
  work): `instrumentation.ts` used an early-return runtime guard, so the edge
  compile still tried to bundle the pg driver and failed on node built-ins.
  The prisma import now sits inside the positive `NEXT_RUNTIME === "nodejs"`
  branch (the statically-eliminated pattern from the Next docs). `next build`
  passes again.

### Post-MVP — Demo-day polish pass (2026-07-11)

Full-product review (UI/UX, banking presentation, AI pipeline, demo simulation)
ahead of Demo Day. No engine, calculation, or schema change. Highlights:

- **Container-query layout for the shared Financial Intelligence panel**
  (`@container` + `@lg/@2xl/@3xl/@5xl` grids on KPIs, drivers, trends, ratio
  tables, detail grids): the panel now adapts to its host column, fixing the
  crushed/clipped officer review center column at 1440px. Review workspace
  simplified to two columns (intelligence | decision rail); the timeline moved
  into the decision rail.
- **Fixed a crash on "Continue to Review" right after an upload** (upload API
  response lacked `processingStatus`; the new document badge indexed
  undefined). API now returns it; badge falls back to Uploaded.
- **Honest document badges everywhere**: case page/wizard now show the real
  extraction status (Uploaded/Queued/Processing/Extracted/Failed) via shared
  `DOCUMENT_STATUS_META` — no more hardcoded "Pending Analysis" next to
  extracted figures.
- **Banking-grade money display**: accounting negatives `(SAR 8,000,000.00)`
  everywhere; whole-SAR (`formatMoneyWhole`) in dense tables (queue, cases,
  ratio/flag evidence, driver metric).
- **Memo quality**: prompt v2 — ratios reach the model at 2dp so memos quote
  "2.33", never "2.3333" (cache-invalidating bump; test updated).
- **Demo cast + data**: seed personas are now Nawaf Alharthi (Admin), Omar
  Alkaltham (Risk Officer · Alinma Bank — the topbar shows the bank for staff),
  Abdulrahman Yaghmour (Contractor, Rawabi). `seed-demo-cases.mts` now assigns
  the strong/moderate/weak cases to three DIFFERENT companies (Rawabi/Nimah/
  Faisal, each with its own contractor login) so the officer queue reads
  credibly. Admin dashboard has its own subtitle.
- **Verified live end-to-end** (Playwright, real Neon + R2 + OpenAI):
  login → wizard → upload → submit → headline in seconds; officer open →
  lazy gpt-4o-mini memo → underwriting package; weak-case REJECT story; no
  console/page errors. 107/107 tests, typecheck + lint + production build
  clean. NOTE: the OpenAI account intermittently returned `insufficient_quota`
  — top up credits before Demo Day (graceful retry/error states exist).

### Post-MVP — Full-width layout pass (2026-07-08)

UI/UX only — no business logic, calculations, or APIs touched. The app shell
was capped at `max-w-6xl` (1152px), leaving large empty margins on wide
screens. Widened the shell to `max-w-[1600px]` (with `lg:px-10`) so every
dashboard uses the available width. Case detail now places Company Information
and Contract Details side-by-side (50/50) with a fixed 20rem sticky Timeline
sidebar (was a 3-col split that left the timeline card half-empty); the review
Timeline column is sticky too. Wizard pages (new/edit) went `max-w-3xl` →
`max-w-5xl` so the 2-col field grids breathe. The underwriting package stays
document-width (`max-w-4xl`) — a deliberate printable-report measure. Verified
across officer/contractor dashboards, case detail, review, analysis, package
and the wizard at 1920px and 1440px: no horizontal overflow, grids collapse
cleanly. typecheck + lint clean.

### Post-MVP — Hybrid GPT-Vision Extraction (2026-07-08)

Philosophy shift: Daman is an AI underwriting platform, not an OCR engine.
Extraction now picks the cheapest engine that yields the core underwriting
figures. No schema migration. See `docs/IFRS_ENGINE.md` → "Hybrid extraction".

- **`processDocument` (extraction-service):** text-layer first (digital, ~1s, no
  network) → if <5/8 core figures, **GPT-Vision** on statement-page images only
  (`extractViaVision`) → OCR only as a last-resort fallback. Digital demo
  fixtures stay on the text path (verified: `textSource=TEXT_LAYER`, no vision).
- **`LLMProvider.completeVisionJSON`** (new, optional) — OpenAI Chat Completions
  with `image_url` parts (gpt-4o-mini); MockProvider returns empty → OCR
  fallback. `src/services/extraction/vision-extractor.ts` renders pages, calls
  the model, zod-validates, and emits a synthetic `IfrsExtraction` with a
  `VISION_EXTRACTION` provenance warning (figures flagged for officer verify).
- Engines untouched (Financial + Decision). New env: `VISION_ENABLED`,
  `VISION_MAX_PAGES` (6), `VISION_DPI` (150). `TextSource` gains `"VISION"`.
- Verified: 107/107 tests (new `vision-extractor.test.ts` — conversion +
  full rasterize→parse path with a fake provider), typecheck + lint + build
  clean. Live OpenAI vision call reached the API (payload format accepted) but
  the demo key is rate-limited (429) — wiring validated, live output pending a
  non-throttled key.

### Post-MVP — Two-Stage Processing Pipeline (2026-07-08)

Redesigned processing for a hackathon-grade UX: **meaningful results in <3s, full
package in <10s**. No schema migration. See `docs/ASYNC_PROCESSING.md`.

- **Stage 1 — Fast Financial Intelligence.** Extract (statement-pages only,
  cached) → deterministic engine → flip case to **ANALYSIS_READY immediately**
  and surface the underwriting HEADLINE (`lib/finance/headline.ts`
  `deriveHeadline`): Capacity /100, Rating (AAA…CCC), Financial Health /100,
  Risk Level, Recommendation. **Stage 2 — Deep (background):** the AI memo, then
  job COMPLETED; never gates readiness.
- **Critical-path discipline** (the engine is ~1ms; cost is I/O): pipeline
  returns the just-written `FinancialStatement` rows (`createManyAndReturn`) so
  analysis skips a case re-read (that read measured **1.69s** on the dev DB);
  stage-progress writes (`advanceTo`) are fire-and-forget.
- **Poll payload** now `{ ...snapshot, headline }` (`getProcessingViewForOwner`)
  so the dashboard shows results with no page reload. **UI:** rewritten
  `ProcessingDashboard` — "Preparing your underwriting package", progress bar +
  ETA + current/completed steps + headline hero; `deriveProgress` in
  `lib/processing.ts`; "Processing Stalled" wording removed.
- **Measured (dev box, 231ms/query local Postgres — production is ~1–5ms):**
  warm Stage 1 **1.8–2.1s ✅**, entire pipeline (mock AI) **3.0–3.8s ✅**. Cold
  first-run inflated by Prisma warmup. `buildFinancialIntelligence` = 0.72ms.
  Remaining bottleneck: Stage 2 = real LLM latency (~6–7s, tail higher) — which
  is exactly why it is background. `formatStageTargets` logs the ≤3s/≤10s table.
- Verified: 102/102 tests (new `headline.test.ts`, `deriveProgress` suite),
  typecheck + lint + production build clean; seed exercised full two-stage flow.

### Post-MVP — Remote-DB critical-path collapse + Express/Comprehensive modes (2026-07-08)

Philosophy: Daman is an AI underwriting platform, not an OCR engine — optimize
for a believable assessment in seconds. **Measurement first** (`scripts/measure-latency.mts`,
`scripts/drive-processing.mts`): with the demo DB on **remote Neon (us-east-1,
~175ms/round-trip)**, the deterministic engine is ~1ms and digital extraction
~40–90ms, but Stage 1 was spending **~69% on serialized DB round-trips**, ~20% on
the R2 read, and a **~2.5s cold-connect** on the first request. Parsing was ~1.6%
— never the bottleneck. Fix = collapse the round-trip *count* + warm the pool.

- **Pool warming (`src/instrumentation.ts` + `lib/prisma.ts`):** `register()`
  pre-opens **5** connections at boot; the pg pool now keeps them warm
  (`keepAlive`, `idleTimeoutMillis: 0`, `max: 10`). Kills the ~2.5s cold-connect
  from the judge's first request.
- **Stage-1 critical path collapsed ~10 → ~4 serial round-trips:** the contract
  fetch + the `status=PROCESSING` write now run **concurrently** with the ~1s
  document pipeline; the extraction-cache check is folded into the document query
  (`include: { extraction: true }` — no extra round-trip); DocumentExtraction
  persistence, document-status writes, and every audit are **deferred off the
  path** (collected in `pipeline.deferred`, settled with `Promise.allSettled`
  before the job is marked COMPLETED — nothing is lost).
- **Two modes (`UNDERWRITING_MODE`, default `express`):** both process every
  uploaded statement (first success flips the case ANALYSIS_READY — see the
  2026-07-14 first-success orchestration entry). Express fails an unreadable
  scan fast and generates the AI memo **lazily** on first officer open;
  comprehensive adds the OCR fallback and generates the memo eagerly in the
  background. Deterministic engines are **untouched**.
- **429 robustness:** vision extraction (on the critical path) gets a dedicated
  `VISION_TIMEOUT_MS` (12s) so a throttled key fails fast to OCR instead of
  stalling Stage 1; the memo is background/best-effort with retries.
- **Measured (real Neon + R2, warm pool), fresh digital upload — the judge
  scenario:** Stage 1 **~2.4s ✅** (target ≤3s), full pipeline **~3.0s ✅**
  (target ≤10s). Before this change (warm, remote DB): Stage 1 ~3.0s, pipeline
  ~5.2s + a ~2.5s cold-connect. Verified: 107/107 tests, typecheck + lint +
  build clean. New env: `UNDERWRITING_MODE`, `VISION_TIMEOUT_MS`.

### Post-MVP — Lazy AI Memo (contractor never waits for GPT) (2026-07-08)

AI underwriting memo generation was removed from the blocking processing path
and made lazy. Processing now COMPLETES at `FINANCIAL_ANALYSIS`: the
deterministic Financial Intelligence Engine (Underwriting Capacity, Financial
Health, Risk Score, Financial Trends, Status) is sufficient to make the case
reviewable. Measured effect: case processing dropped from **~11–12s to ~4.5–5s**
(the ~6–7s LLM call is off the contractor's path). See `docs/ASYNC_PROCESSING.md`
→ "Lazy AI memo". No schema migration.

- `case-processing-service.ts`: removed the Stage-5 AI block; success now sets
  `stage=FINANCIAL_ANALYSIS`. `PROCESSING_STAGES` (`lib/processing.ts`) no longer
  contains `AI_UNDERWRITING` (enum value retained for labels/historical rows).
- Memo generated from exactly two triggers: (1) a Risk Officer opening the case
  — `review/[id]/page.tsx` fires the new `ensureDecisionIntelligence(caseId)` via
  Next.js `after()` (idempotent, dedupes concurrent opens, system-attributed);
  (2) the existing explicit "Generate AI Analysis" button (unchanged). The
  `DecisionSection` shows a "Preparing AI analysis…" state on officer open.
- Contractor display unchanged and already AI-free (the analysis page renders
  the deterministic panel) — it simply appears ~6–7s sooner.
- Verified: 94/94 tests (processing-step suite updated), typecheck + lint +
  production build clean; seed run shows ~4.5–5s processing → ANALYSIS_READY with
  no `ai_underwriting` stage; lazy generation proved to create exactly one memo
  under 3 concurrent triggers (mock provider).

### Post-MVP — Extraction Engine Speed Optimization (2026-07-08)

The Financial Statement Extraction Engine was re-tuned to optimize for
user-visible speed (targets: **< 10s** digital IFRS reports, **< 20s** scanned).
No schema migration; deployable. See `docs/IFRS_ENGINE.md` → "Performance".

- **Statement-pages-first.** `extractIfrs` now detects statements on the cheap
  text layer *before* OCR, so a clean digital report never OCRs; when OCR is
  needed it targets only statement pages + neighbors (never the whole report),
  capped by `OCR_MAX_PAGES`.
- **Parallelism.** OCR pages run across a worker pool (`OCR_CONCURRENCY`, new
  `OcrPool`); a case's documents extract concurrently (`DOCUMENT_CONCURRENCY=3`).
- **Caching.** Retry reuses a byte-identical, already-COMPLETED document's
  extraction (rebuilt from persisted line items — no re-read/re-OCR).
- **Measurement.** New `src/lib/ifrs/perf.ts` `StageTimer` → per-stage duration,
  % of total, and a bottleneck recommendation; logged per document and per case
  and persisted in `DocumentExtraction.raw.perf`. New CLI
  `scripts/benchmark-extraction.mts` profiles real reports against the targets.
- **Field policy.** Full canonical figure set still extracted (the financial
  engine needs all of it); the 8 core underwriting figures are a completeness
  gate (`CORE_FIGURE_KEYS`), not a hard field-drop — dropping fields saves ~0ms
  (cost is PDF text/OCR I/O) and would break analysis.
- New env knobs: `OCR_CONCURRENCY` (2), `OCR_DPI` (200), `OCR_MAX_PAGES` (10).
- **Finding surfaced by the new report:** for digital reports extraction is now
  ~1–2s; the dominant processing stage is **AI memo pre-generation (~6–7s)**,
  which is best-effort and never gates underwriting. Deferring it to first
  officer-open is the next lever for a sub-10s end-to-end (product decision —
  changes when the memo first exists).
- Verified: 94/94 unit tests (incl. new `perf.test.ts`), typecheck + lint +
  production build clean; full submit→processing→ANALYSIS_READY exercised
  against the real DB via `scripts/seed-demo-cases.mts` (3 cases, reports logged).

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

### Post-MVP — Financial Intelligence Dashboard redesign (2026-07-08)

UI/UX only — **no engine, calculation, or figure changed**. The analysis panel
(`FinancialIntelligencePanel`, shared by the contractor analysis page and the
officer review workspace) was rebuilt to read top-down like an underwriting
memo instead of a debugging view:

- **Verdict hero** (`verdict-hero.tsx`) leads and dominates — answers "Can the
  bank issue this guarantee?" with the bank-policy recommendation as the largest
  element (still preliminary, Risk Officer decides).
- **Three executive KPI cards** (`executive-kpis.tsx`): Underwriting Capacity
  (score /100 + rating AAA…CCC + capacity status), Financial Health (score /100
  + overall condition), Risk Level (score /100 + risk band). Fed from
  `deriveHeadline` — no recomputation.
- **Financial Drivers** (`financial-drivers.tsx`): Liquidity, Leverage,
  Profitability, Cash Flow, Working Capital — each a clean status card (Excellent
  → Poor word + meter + one supporting metric). **Raw engineering weights and
  bare `0.00` sub-scores removed** — sub-scores sourced from engine components,
  supporting metrics from the already-computed latest-year ratios.
- Presentation helpers centralized in `lib/finance/display.ts` (status ladders +
  the existing emerald/amber/red palette). Redundant KPI strip removed (drivers
  now cover it); flags, trends, ratio tables retained below as evidence. The old
  `capacity-card.tsx`, `risk-gauge.tsx`, `stat-tile.tsx` (weight-exposing) were
  deleted as orphaned.
- Verified: typecheck + lint + production build (turbopack) clean.

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

No feature sprint scheduled — Sprint 6 was cancelled (2026-07-07) and the
post-MVP speed/experience work (2026-07-08) is complete. Candidate work if it
resumes:

- **Future — Deep Extraction:** production-grade document AI for scanned
  Arabic statements (the current OCR fallback is unreliable on dense
  Arabic-Indic numeric tables — those figures are gated out, not trusted).
  This is the extraction lever beyond hybrid GPT-Vision.
- **Future integrations (architecture-ready only):** Saudi Open Banking
  (`ExposureProvider`), SIMAH (`CreditBureauProvider`), Core Banking.
- **Hardening backlog** (`TODO.md` + `TECH_DEBT.md`): committed E2E suite, CI,
  auth hardening, a real queue/visibility-timeout if volume outgrows the
  `after()`-only processing model.

## Known limitations

- **AI memo latency is a real external cost (~6–7s, tail higher)** — which is
  exactly why it is Stage 2 / lazy and never on the contractor's path.
- **Vision-extracted figures are flagged for officer verification**, not
  auto-trusted; scanned Arabic numeric OCR is gated out entirely
  (`UNVERIFIED_OCR_VALUES`).
- **Express mode trades recovery depth for speed:** all statements are
  processed, but a scanned document GPT-Vision cannot read fails fast in
  express — the OCR fallback needs Comprehensive mode.
- **Processing has no scheduled backstop** (Hobby-plan deliberate): a lost
  trigger self-heals on the next poll; a mid-run crash needs a one-click retry
  (TECH_DEBT #23).
- Full ledger of intentional shortcuts + risks: `TECH_DEBT.md`.

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
