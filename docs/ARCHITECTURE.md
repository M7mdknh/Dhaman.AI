# Daman — Architecture

## Stack

Full-stack TypeScript. One codebase, one deployable. No separate backend
service (decision 2026-07-05; FastAPI explicitly rejected).

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15, App Router |
| Language | TypeScript (strict) |
| Database | PostgreSQL |
| ORM | Prisma |
| UI | shadcn/ui + Tailwind CSS v4, Inter font |
| Validation | zod (shared between server actions and forms) |
| Auth | Credentials + signed httpOnly session cookie (JWT via `jose`) |
| Money | `Prisma.Decimal` end-to-end — never `float`/`number` arithmetic |

## Layering

```
app/            routes and pages (thin — rendering + form wiring only)
  (auth)/       public: login, register
  (app)/        protected: everything else (session required)
components/
  ui/           shadcn primitives
  layout/       app shell (sidebar, top nav)
lib/            infrastructure: prisma client, session, password, env, utils
lib/validation/ zod schemas (single source of truth for input shapes)
services/       business logic — the ONLY layer that touches Prisma
middleware.ts   route protection (session check + redirect)
```

Rules:

- **No Prisma calls in components or route files.** Pages call services;
  server actions validate with zod, then call services.
- **Server actions** are used for mutations (auth, later case CRUD). Route
  handlers are reserved for non-form endpoints (file download, health).
- Business logic never lives in UI components.
- Every state-changing operation writes an `AuditLog` row.

## Domain model (Sprint 0 scope)

```
User            role: CONTRACTOR | RISK_OFFICER | ADMIN; passwordHash;
                nullable companyId (contractors belong to a Company; bank staff don't)
Company         CR number, name, sector, city; 1 → N users, 1 → N cases
UnderwritingCase  companyId + createdById, status state machine (DRAFT → … → ISSUED);
                internal autoincrement `seq` (never displayed) — the case service
                formats the human-readable `reference` from it in the app layer;
                createdAt vs submittedAt are distinct business events
ContractDetails 1:1 with case — beneficiary(+type), title, sector, value,
                guarantee amount/type, duration, location
Document        uploaded file metadata (fileName, mimeType, fileSize,
                server-generated storageKey)
FinancialStatement  one row per fiscal year of parsed IFRS figures (populated
                Sprint 4); FK provenance link to its source Document (SetNull)
AuditLog        append-only actor/action/detail trail (no update/delete paths)
```

Deliberately absent until their sprint: FinancialAnalysis (Sprint 5), AI/memo
tables (Sprint 6), Guarantee registry (Sprint 8), Open Banking / SIMAH
(Future — interfaces + mocks only).

## The case status state machine

`DRAFT → SUBMITTED → PARSING → ANALYSIS_READY → UNDER_REVIEW →
(APPROVED → ISSUED) | DECLINED | INFO_REQUESTED (→ UNDER_REVIEW)`

The full enum exists from Sprint 0 (it is core domain vocabulary and avoids
migration churn), but Sprint 0–3 code only ever uses DRAFT/SUBMITTED.
Transitions are enforced in the case service, never in UI.

## Security posture (lessons from V1 — do not regress)

- Sessions are **signed and verified** server-side (V1 shipped unverified JWT
  claims — never again).
- Every data access is scoped by role AND ownership in the service layer.
- Uploads: allowlisted types, size caps, **server-generated storage keys** —
  the client filename is metadata only, never a path.
- Files are served through authenticated routes, never public URLs.
- Secrets only via environment variables; `.env` is git-ignored,
  `.env.example` documents every variable.

## Future integration sockets

Open Banking and SIMAH will plug in as TypeScript interfaces
(`ExposureProvider`, `CreditBureauProvider`) with mock implementations. No
real integration code in the MVP.
