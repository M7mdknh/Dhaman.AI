# Technical Debt Register

Honest ledger of shortcuts, deferrals, and the reasoning behind them.
Reviewed at the end of every sprint. Nothing here is forgotten — it is
deliberately parked.

---

## Intentional MVP shortcuts (accepted for now)

| # | Shortcut | Risk | Pay down when |
| --- | --- | --- | --- |
| 1 | **Stateless JWT sessions — no server-side revocation.** Logout deletes the cookie, but a captured token stays valid until its 8h expiry. | Stolen-token window | Sprint 1 hardening (session table or token version stamp on User) |
| 2 | **No login rate limiting / lockout.** Credentials can be brute-forced at network speed. | Brute force | Sprint 1 hardening — before any internet-facing deployment |
| 3 | **No password reset / email verification.** Emails are unverified strings. | Account recovery impossible | When real users exist (post-MVP or Sprint 1 if demanded) |
| 4 | **Demo password hardcoded in `prisma/seed.ts`** and printed to console. | Known credential if seed runs in prod | Guard seed by `NODE_ENV` / move to env var before any shared deployment |
| 5 | **No mobile navigation drawer** — sidebar hidden below `md`; only the topbar (brand + sign out) remains. | Unusable nav on phones | Sprint 2, alongside dashboard layout work |
| 6 | **Dark theme tokens exist but no toggle is exposed.** | None (light-only) | Whenever UX asks for it |
| 7 | **No committed automated tests.** Verification ran via a Playwright script in the session scratchpad; Playwright is a devDependency but no `tests/` suite or test script exists in-repo. | Regressions land silently | Sprint 2 at the latest — commit browser E2E + engine unit tests (Sprint 5 engine must be test-first) |
| 8 | **No CI.** lint/typecheck/build run manually. | Broken main | With the first committed test suite |
| 9 | **No security headers** (CSP, HSTS, X-Frame-Options…). | Clickjacking/XSS hardening absent | Before external exposure; add via `next.config.ts` headers |
| 10 | **No structured logging or error monitoring.** `console` only. | Blind in production | Before pilot deployment |

## Environment constraints (not code debt, but bites us)

- **`daman` role lacks `CREATEDB`** → `prisma migrate dev` cannot create its
  shadow DB. Workaround used for the initial migration:
  `prisma migrate diff --from-empty … --script` + `prisma migrate deploy`.
  Fix before the next schema change: `ALTER ROLE daman CREATEDB;`
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
   avoid per-sprint enum migrations; only DRAFT/SUBMITTED are used before
   Sprint 4.
6. **`UnderwritingCase.seq`** (internal autoincrement) exists purely so the
   application layer can mint race-free human references; never displayed raw.
7. **Money is `Decimal(18,2)` everywhere**; float arithmetic is banned.
8. **AuditLog is append-only by convention** — no update/delete code path; DB
   links use `SetNull` so history survives entity deletion. (No DB-level
   immutability trigger yet — see below.)

## Postponed features (by design — do NOT build early)

- Financial analysis tables & engine (Sprint 5), AI/memo storage (Sprint 6),
  Guarantee registry (Sprint 8)
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
