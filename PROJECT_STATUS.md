# PROJECT STATUS

> Living snapshot of where Daman V2 stands. Read this + `TODO.md` at the start
> of any session. **Last updated: 2026-07-05.**

Current Sprint

**Sprint 0 — Foundation: ✅ COMPLETE.** Awaiting approval to start Sprint 1.

---

## Stack (decided 2026-07-05)

Full-stack TypeScript: Next.js 15 · Prisma 7 · PostgreSQL · shadcn/ui · zod.
FastAPI is NOT used.

---

## Completed (Sprint 0)

- Repository cleaned, git initialized, docs rewritten (`docs/PRODUCT.md`,
  `ARCHITECTURE.md`, `PHASES.md`), boilerplate removed
- PostgreSQL (native local service) + Prisma 7 (driver adapter, generated
  client in `src/generated/`, git-ignored)
- Initial migration `20260705153143_init`: User, Company, UnderwritingCase,
  ContractDetails, FinancialStatement, Document, AuditLog (+5 enums, Decimal
  money, cuid ids, append-only audit)
- Approved schema refinements applied before first migration:
  FinancialStatement→Document FK, internal case `seq` counter,
  `User.companyId` (Company 1→N Users), Document metadata = fileName /
  mimeType / fileSize / storageKey
- Authentication foundation: register (contractor-only), login, logout;
  bcrypt(12); HS256-signed JWT in httpOnly/lax cookie (8h); roles CONTRACTOR /
  RISK_OFFICER / ADMIN; verified-JWT middleware + protected layout
- App shell: sidebar + topbar, banking design tokens (Inter, neutral +
  emerald), placeholder dashboard; auth pages
- Seed: 3 demo users (one per role) + 3 demo companies; contractor linked to
  Rawabi Contracting Co.
- Verification: production build clean; **13/13 browser E2E checks passed**
  (Playwright/Chromium); health endpoint reports live DB; audit rows confirmed

## Demo accounts

| Email | Role | Password |
| --- | --- | --- |
| admin@daman.local | Admin | `Daman!2026` |
| officer@daman.local | Risk Officer | `Daman!2026` |
| contractor@daman.local | Contractor | `Daman!2026` |

---

## Next

Sprint 1 (see `TODO.md`) — re-baselined to auth hardening since core auth
shipped in Sprint 0. Scope needs user confirmation; alternatively skip
straight to Sprint 2 (Enterprise Dashboard).

---

## Blockers / environment constraints

- The `daman` DB role lacks `CREATEDB`, so `prisma migrate dev` cannot create
  its shadow database. Initial migration was generated with
  `prisma migrate diff` + `migrate deploy` (equivalent result). **Before the
  next schema change** run: `sudo -u postgres psql -c "ALTER ROLE daman CREATEDB;"`
- Docker daemon not accessible on this machine → PostgreSQL runs as the native
  system service instead of docker-compose.
- Node via nvm (`v24.18.0`) — not on the default non-interactive PATH.

---

## Notes

- Known debt and intentional shortcuts are tracked in `TECH_DEBT.md`.
- Reference implementation: `../wakeel-ai` (V1). Its pure financial engine
  (`backend/app/core/`) is the blueprint for Sprint 5. Its security flaws
  (unverified JWTs, no ownership checks, client-filename storage paths) must
  NOT be carried over.
- Every sprint must end deployable.
