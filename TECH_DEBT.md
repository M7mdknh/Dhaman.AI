# Technical Debt Register

Honest ledger of shortcuts, deferrals, and the reasoning behind them.
Reviewed at the end of every sprint. Nothing here is forgotten — it is
deliberately parked.

---

## Intentional MVP shortcuts (accepted for now)

| # | Shortcut | Risk | Pay down when |
| --- | --- | --- | --- |
| 1 | **Stateless JWT sessions — no server-side revocation.** Logout deletes the cookie, but a captured token stays valid until its 8h expiry. | Stolen-token window | Auth-hardening backlog (session table or token version stamp on User) |
| 2 | ~~**No login rate limiting / lockout.**~~ **RESOLVED (RC1):** audit-log-backed sliding-window limiter (per-email + per-IP for login, per-IP for register) in `rate-limit-service`, enforced in `auth-service`. Shared across serverless instances via the DB, no extra infra. | — | — |
| 3 | **No password reset / email verification.** Emails are unverified strings. | Account recovery impossible | When real users exist (post-MVP or auth-hardening backlog if demanded) |
| 4 | ~~**Demo password hardcoded in `prisma/seed.ts`**~~ **MITIGATED (RC1):** the seed refuses to run when `NODE_ENV=production` unless `ALLOW_PROD_SEED=true`, and the password is overridable via `SEED_PASSWORD`. | Low (dev-only credential) | Full removal when in-app admin provisioning lands |
| 5 | **No mobile navigation drawer** — sidebar hidden below `md`; only the topbar (brand + sign out) remains. Case pages themselves are responsive. | Unusable nav on phones | Auth-hardening backlog batch |
| 6 | **Dark theme tokens exist but no toggle is exposed.** | None (light-only) | Whenever UX asks for it |
| 7 | **No committed browser E2E suite.** Unit tests exist in-repo since Sprint 2 (`tests/` — parser + financial engines, 51 assertions), but the Sprint 0/1 browser checks live only in scratchpad Playwright scripts. | UI regressions land silently | Officer workspace sprint at the latest — commit an E2E suite |
| 8 | **No CI.** lint/typecheck/build run manually. | Broken main | With the first committed test suite |
| 9 | ~~**No security headers**~~ **PARTIALLY RESOLVED (RC1):** HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy ship on every response (`next.config.ts`). CSP is still intentionally deferred (needs per-request nonces for Next's inline runtime). | CSP only | CSP before broad external exposure |
| 10 | **No structured logging or error monitoring.** `console` only. | Blind in production | Before pilot deployment |
| 11 | ~~**Uploads on local disk**~~ **RESOLVED (RC1):** `S3Storage` adapter (AWS S3 / Cloudflare R2 / MinIO) is selected when `S3_BUCKET` is set; production **refuses** the local-disk fallback unless `ALLOW_LOCAL_STORAGE=true`, so an unconfigured prod deploy fails fast instead of silently dropping uploads. | — | — |
| 12 | **No malware scanning of uploaded PDFs** (mime + magic-byte + size checks only). | Malicious file stored/served | Before external users upload real files |
| 13 | **Dashboard search/filter is client-side in-memory** over the full case list (no pagination). Deliberate: a prod-only Next 15.5 bug drops searchParams-only `router.replace` navigations (see below), and MVP case volumes are tiny. | Slow with thousands of cases | Officer queue sprint (server pagination lands there); re-test router bug on Next upgrade |
| 14 | **Timeline "Draft Saved" uses `updatedAt`** — approximate (any row touch counts) and shown even for never-edited drafts. Precise timestamps exist in AuditLog if needed. | Cosmetic imprecision | When the timeline gains audit-backed entries (officer sprint) |
| 15 | **Wizard step forms stay mounted (CSS-hidden)** to preserve state across navigation — all field ids must be unique page-wide (contract selects are prefixed `contract-`). | Duplicate-id bugs if forgotten | Note for future wizard steps |
| 16 | ~~The contractor sees the AI underwriting memo~~ **RESOLVED in Sprint 5**: the memo, memo generation, and the Underwriting Package are officer-only; the contractor sees decision status, request-info messages, and approval conditions only. | — | — |
| 17 | **Company financial data leaves the machine when an OpenAI key is configured.** Two paths now: (a) the memo — structured engine outputs + company registration data (no personal contacts, no raw statement rows); (b) **GPT-Vision extraction — rendered IMAGES of the statement pages are sent to the vision model** for scanned/damaged documents (`VISION_ENABLED`, on by default). Acceptable for MVP; a bank deployment needs a data-processing agreement or an in-VPC/Azure endpoint, and/or `VISION_ENABLED=false`. | Confidentiality obligations | Before pilot with real customer data (AzureOpenAIProvider is one file + a factory entry); Deep Extraction replaces the fallback path |
| 18 | **Memo regeneration is unbounded** — mitigated in Sprint 5 (generation is officer-only now), but there is still no per-user/day quota or cost tracking. | Provider cost abuse | First real API key (add a quota + usage log) |
| 19 | **No officer exclusivity on reviews** — the first officer to start a review is recorded as assigned, but any officer can still decide any case (deliberate for a 1-officer MVP bank). | Two officers could act on one case concurrently; last write wins on status | When a second real officer exists: claim/lock or optimistic concurrency on status transitions |
| 20 | **The LG QR stamp is informational, not cryptographic** — it encodes the particulars (reference, case, amount, expiry) but there is no signature or public verification endpoint, so a QR scan proves nothing by itself. | Forged-document risk if relied on for verification | Before real instruments: signed payload + `/verify/[reference]` endpoint |
| 21 | **INFO_REQUESTED has no in-app response channel** — the contractor sees the request message, but a submitted case is read-only, so the answer arrives out of band (email/RM) and the officer resumes manually. | Untracked correspondence | Contractor reply + supplementary-upload flow (post-MVP) |
| 22 | **`officer.case_opened` audit is deduplicated per officer/case within 15 min** — a deliberate compromise between the spec ("log opens") and refresh/post-action re-render noise. | Repeat opens inside the window are not individually recorded | Revisit if compliance needs every view event |
| 23 | **Async processing runs in the request-time `after()` only — no scheduled backstop (deliberate, for Hobby-plan deployability).** Submission fires `runCaseProcessing` immediately via `after()`; a lost trigger self-heals on the next dashboard poll (still-QUEUED jobs re-fire, self-claiming). A run whose serverless invocation is killed mid-flight (left RUNNING) is NOT auto-recovered — the dashboard detects the >5-min stall and offers a one-click **Retry Analysis**. A Vercel Cron drainer was built and then removed: Vercel Cron needs a paid cadence and blocked the Hobby deploy, and `maxDuration` overrides would exceed the Hobby function cap. | Manual retry after a rare mid-run crash; a heavy OCR job may not finish within the default Hobby function budget | If the Hobby budget proves too tight or volume grows: a paid plan + a real queue (QStash/Inngest) with visibility timeouts |
| 24 | **OCR language traineddata is fetched from a public CDN by default.** The tesseract WASM core resolves from `node_modules`, and `TESSERACT_LANG_PATH` / `TESSERACT_CACHE_PATH` are now env-configurable (cache defaults to the writable `/tmp`), but no `ara`/`eng` traineddata is bundled in-repo. | First OCR on a fresh instance needs egress to the CDN | Bundle traineddata on a private mirror/volume and set `TESSERACT_LANG_PATH` for egress-restricted / air-gapped deploys |
| 25 | **Full-size uploads (>4.4 MB) on Vercel REQUIRE the bucket CORS rule** (README → Deploying). Direct-to-storage presigned uploads bypass Vercel's hard 4.5 MB function-body cap; without the CORS rule the client silently falls back to the through-the-server route, which that cap breaks for real annual reports. The R2 API token in use is object-scoped and cannot set CORS programmatically — it is a one-time dashboard step. | Uploads of real (5–10 MB) reports fail on a fresh deployment until CORS is configured | Configure the rule now; consider an admin health check that verifies bucket CORS at boot |
| 26 | **Two-page-spread statement layouts still defeat the deterministic text extractor** (verified with STC 2024 consolidated financial statements: rich text layer, but two-page-spread layout → <5 core figures found). Vertical cell-per-line layouts were FIXED 2026-07-15 (`reflowVerticalRows` — verified on a real PwC-audited report, 14 exact figures/year from the text layer); spreads remain vision-only. GPT-Vision on the detected statement pages is the designed recovery and needs `OPENAI_API_KEY` in production; with the mock provider such documents fail fast with an honest per-document message and the case continues on sibling documents. | A demo without an OpenAI key cannot extract two-page-spread annual-report layouts — use fixture-style or single-column statements, or set the key | Teach the line extractor multi-column spreads if real-statement extraction without AI becomes a requirement |
| 27 | **Scroll-driven section reveals (`.scroll-reveal`) are Chromium-only progressive enhancement** (`@supports (animation-timeline: view())`). Firefox/Safari render those sections statically (always visible — never hidden or broken); all other motion utilities are plain CSS animations and work everywhere. | Demo on a non-Chromium browser loses the scroll fade-ins (cosmetic only) | When Firefox/Safari ship scroll-timeline support, or swap for an IntersectionObserver if cross-browser reveals become a requirement |
| 28 | ~~**Financial Integrity WARNING/INFO findings are recorded but not shown in the UI.**~~ **RESOLVED (2026-07-15):** every assessment now carries an **Assessment Confidence** badge (High / Medium / Low) beside the recommendation it qualifies, and any warning or blocking finding raises a **Validation Report** (Summary / Confidence / Statements Affected / Issues Found / Recommended Action) on the analysis page, the review desk, and the printed Underwriting Package. A Low-confidence case shows "Assessment could not be completed" in place of the verdict and drafts no memo. | — | — |
| 29 | **`Loans and borrowings` is deliberately left unmapped by the normalizer.** It appears under BOTH the current and non-current liability sections of a real balance sheet, and the line extractor has no section context — mapping it to either `shortTermDebt` or `longTermDebt` would be a coin flip that silently skews leverage. Absent beats wrong: the figure is dropped and `totalDebt` degrades to the printed value or the short+long derivation. | A statement using only this caption yields no debt split | When the line extractor tracks balance-sheet sections (current vs non-current headers), which would also let several other ambiguous captions map safely |

## Environment constraints (not code debt, but bites us)

- **The database is now Neon cloud Postgres** (pooled endpoint), not the old
  local `daman` role. The normal Prisma flow works against it —
  `prisma migrate deploy` applies migrations cleanly and `migrate dev
  --create-only` authors them; the historical local-shadow-DB / CREATEDB
  workaround is no longer needed. Neon is remote, so CLI round-trips are slow
  and occasionally flaky (a transient `ETIMEDOUT` mid-command just needs a
  retry) — do NOT read CLI latency as app latency (the deployed app uses a
  warm pooled connection).
- **Next.js 15.5 prod-only router bug**: a searchParams-only `router.replace`
  from a client component fetches the RSC payload but never commits the
  navigation — URL and UI stay stale; dev server works. Avoid URL-synced
  filters until verified fixed on a newer Next.
- **Docker unavailable** → native PostgreSQL instead of docker-compose;
  `DATABASE_URL` is the single source of truth so this is transparent to code.
- **Node lives in nvm**, not on the system PATH (`~/.nvm/versions/node/v24.18.0`).

## Architectural decisions (record, not debt)

1. **Full-stack Next.js + Prisma, no separate backend** — one deployable, one
   type system (user decision 2026-07-05, supersedes the FastAPI plan).
2. **Custom credentials auth over Clerk/Auth.js** — zero external dependency,
   full control, bank-appropriate; jose-signed JWT cookie, always verified.
3. **Self-registration = CONTRACTOR only** — officers/admins are provisioned,
   never self-registered (deliberate deviation from the original TODO wording).
4. **cuid() primary keys** — non-enumerable; blocks the IDOR-by-counting class
   of bugs V1 had.
5. **Full `CaseStatus` enum from day one** — domain vocabulary lookahead to
   avoid per-sprint enum migrations; only DRAFT/SUBMITTED are used until
   IFRS parsing lands (now Sprint 2).
6. **`UnderwritingCase.seq`** (internal autoincrement) exists purely so the
   application layer can mint race-free human references; never displayed raw.
7. **Money is `Decimal(18,2)` everywhere**; float arithmetic is banned.
8. **AuditLog is append-only by convention** — no update/delete code path; DB
   links use `SetNull` so history survives entity deletion. (No DB-level
   immutability trigger yet — see below.)
9. **Financial analysis is computed on demand — no `FinancialAnalysis` table**
   (user decision 2026-07-06). The engine is deterministic and pure, so the
   same statements always produce the same analysis; persisting it could only
   be redundant or stale. Immutable **Analysis Snapshots** arrive with the AI
   Underwriter / officer sprints, which need a frozen record of what a memo or
   decision looked at. Snapshot storage is deliberately not built yet.
10. **Risk Score convention: higher = riskier** (0 minimal → 100 maximal),
   bands EXCELLENT < 15 ≤ LOW < 35 ≤ MODERATE < 55 ≤ HIGH < 75 ≤ CRITICAL —
   all boundaries configurable in `lib/finance/thresholds.ts`. Underwriting
   Capacity (higher = better) stays the primary KPI; the officer-facing
   recommendation will be derived from the risk band in Sprint 4, never by AI.

11. **AI recommendation discipline (Sprint 4):** the recommendation of record
   is ALWAYS `RECOMMENDATION_BY_BAND[riskBand]` (deterministic). The model is
   handed that value, must echo and explain it, and any divergence is stored
   in `aiRecommendation` + flagged `aiDiverged` — policy prevails. Runtime
   provider failures error visibly; they are never silently downgraded to the
   mock provider.

12. **Officer workflow (Sprint 5):** two disjoint access paths — contractors
   ownership-scoped, bank staff role-gated (never ownership). "Manual
   Review" is not an officer decision (the officer IS the manual review);
   the vocabulary is Approve / Approve with Conditions / Reject / Request
   Info, recorded append-only with mandatory reasons. Queue priority is
   derived (risk band + exposure), never hand-maintained. LG particulars
   are frozen at issue time and the PDF is rendered on demand, never
   stored. Approval conditions are applicant-visible; internal reasoning
   and notes never are.

## Postponed features (by design — do NOT build early)

- ~~Guarantee registry list + per-case audit report export (Sprint 6)~~ —
  Sprint 6 CANCELLED by user decision (2026-07-07); these will not be built
- ~~Document `sha256` checksum~~ — **DONE**: `Document.sha256` is populated by
  the extraction pipeline (used for the retry extraction cache); object storage
  (S3/R2) shipped in RC1
- Admin user-management UI; profile pages
- Deep Extraction (production document AI for scanned Arabic statements) —
  Future phase; replaces the OCR fallback for bank-grade numeric extraction
- Open Banking / SIMAH — interfaces + mocks only, Future phase
- Arabic/RTL localization

## Future improvements (nice-to-have, unscheduled)

- **Per-case company snapshot.** Case views join the live Company row; the
  2026-07-15 identity lock prevents renames once cases are submitted, but a
  legitimate registration change (admin-approved) would still relabel history.
  The durable fix is snapshotting company identity onto the case at submission
  (as ContractDetails already does for the contract).

- DB-level audit immutability (`REVOKE UPDATE/DELETE` or a trigger) instead of
  convention-only
- Repository layer between services and Prisma if service count grows enough
  to warrant it (avoid premature abstraction until then)
- `server-only` package guards on `lib/prisma`, `lib/env`, and services
- Rotate `SESSION_SECRET` support (key ring with `kid` header)
- Request-scoped logging with correlation IDs once observability lands
