# PROJECT STATUS

> Living snapshot of where Daman V2 stands. Read this + `TODO.md` at the start
> of any session. **Last updated: 2026-07-06.**

Current Sprint

**Sprint 1 — Contractor Workspace: ✅ COMPLETE.** Awaiting approval to start
Sprint 2 (IFRS Parsing).

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

## Demo accounts

| Email | Role | Password |
| --- | --- | --- |
| admin@daman.local | Admin | `Daman!2026` |
| officer@daman.local | Risk Officer | `Daman!2026` |
| contractor@daman.local | Contractor | `Daman!2026` |

---

## Next

Sprint 2 — IFRS Parsing (see `TODO.md`). Deterministic PDF extraction into
`FinancialStatement` rows; no LLM involved.

---

## Blockers / environment constraints

- The `daman` DB role STILL lacks `CREATEDB` (sudo needs a password, could not
  grant it non-interactively). Sprint 1 migration was generated with
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  + `migrate deploy` (note: Prisma 7 removed `--from-url`). Before the next
  schema change, ideally run: `sudo -u postgres psql -c "ALTER ROLE daman CREATEDB;"`
- Docker daemon not accessible → PostgreSQL runs as the native system service.
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
