# Technical Debt Register

Honest ledger of shortcuts, deferrals, and the reasoning behind them.
Reviewed at the end of every sprint. Nothing here is forgotten — it is
deliberately parked.

---

## Intentional MVP shortcuts (accepted for now)

| # | Shortcut | Risk | Pay down when |
| --- | --- | --- | --- |
| 1 | **Stateless JWT sessions — no server-side revocation.** Logout deletes the cookie, but a captured token stays valid until its 8h expiry. | Stolen-token window | Auth-hardening backlog (session table or token version stamp on User) |
| 2 | **No login rate limiting / lockout.** Credentials can be brute-forced at network speed. | Brute force | Auth-hardening backlog — before any internet-facing deployment |
| 3 | **No password reset / email verification.** Emails are unverified strings. | Account recovery impossible | When real users exist (post-MVP or auth-hardening backlog if demanded) |
| 4 | **Demo password hardcoded in `prisma/seed.ts`** and printed to console. | Known credential if seed runs in prod | Guard seed by `NODE_ENV` / move to env var before any shared deployment |
| 5 | **No mobile navigation drawer** — sidebar hidden below `md`; only the topbar (brand + sign out) remains. Case pages themselves are responsive. | Unusable nav on phones | Auth-hardening backlog batch |
| 6 | **Dark theme tokens exist but no toggle is exposed.** | None (light-only) | Whenever UX asks for it |
| 7 | **No committed automated tests.** Sprint 0 (13 checks) and Sprint 1 (28 checks) were verified via scratchpad Playwright scripts; Playwright is a devDependency but no `tests/` suite exists in-repo. | Regressions land silently | Sprint 2 at the latest — commit browser E2E + parser unit tests (the Financial Intelligence engine must be test-first) |
| 8 | **No CI.** lint/typecheck/build run manually. | Broken main | With the first committed test suite |
| 9 | **No security headers** (CSP, HSTS, X-Frame-Options…). | Clickjacking/XSS hardening absent | Before external exposure; add via `next.config.ts` headers |
| 10 | **No structured logging or error monitoring.** `console` only. | Blind in production | Before pilot deployment |
| 11 | **Uploads on local disk** (`UPLOAD_DIR`, default `./uploads`). Fine locally; on Vercel/serverless the filesystem is ephemeral — uploads would vanish. The `FileStorage` adapter seam exists for S3/GCS. | Data loss on serverless deploy | Before any cloud deployment (object-store adapter) |
| 12 | **No malware scanning of uploaded PDFs** (mime + magic-byte + size checks only). | Malicious file stored/served | Before external users upload real files |
| 13 | **Dashboard search/filter is client-side in-memory** over the full case list (no pagination). Deliberate: a prod-only Next 15.5 bug drops searchParams-only `router.replace` navigations (see below), and MVP case volumes are tiny. | Slow with thousands of cases | Officer queue sprint (server pagination lands there); re-test router bug on Next upgrade |
| 14 | **Timeline "Draft Saved" uses `updatedAt`** — approximate (any row touch counts) and shown even for never-edited drafts. Precise timestamps exist in AuditLog if needed. | Cosmetic imprecision | When the timeline gains audit-backed entries (officer sprint) |
| 15 | **Wizard step forms stay mounted (CSS-hidden)** to preserve state across navigation — all field ids must be unique page-wide (contract selects are prefixed `contract-`). | Duplicate-id bugs if forgotten | Note for future wizard steps |

## Environment constraints (not code debt, but bites us)

- **`daman` role lacks `CREATEDB`** → `prisma migrate dev` cannot create its
  shadow DB. Workaround used for both migrations so far (Prisma 7 removed
  `--from-url`): `prisma migrate diff --from-config-datasource --to-schema
  prisma/schema.prisma --script` + `prisma migrate deploy`.
  Fix before the next schema change: `ALTER ROLE daman CREATEDB;`
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

## Postponed features (by design — do NOT build early)

- Financial analysis tables & engine (Sprint 3), AI/memo storage (Sprint 4),
  Guarantee registry (Sprint 6)
- Document `sha256` checksum — explicitly deferred until external object
  storage is introduced (user decision)
- Admin user-management UI; profile pages
- Open Banking / SIMAH — interfaces + mocks only, Future phase
- Arabic/RTL localization

## Future improvements (nice-to-have, unscheduled)

- DB-level audit immutability (`REVOKE UPDATE/DELETE` or a trigger) instead of
  convention-only
- Repository layer between services and Prisma if service count grows enough
  to warrant it (avoid premature abstraction until then)
- `server-only` package guards on `lib/prisma`, `lib/env`, and services
- Rotate `SESSION_SECRET` support (key ring with `kid` header)
- Request-scoped logging with correlation IDs once observability lands
