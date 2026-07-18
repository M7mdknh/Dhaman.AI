# Dhaman — Architecture

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
lib/ai/         LLM provider abstraction (interface + OpenAI/Mock providers
                + factory) — the ONLY vendor-aware code in the app; also the
                vision path (`completeVisionJSON`) for scanned-document reading
lib/ifrs/       pure IFRS extraction primitives (pdf-text, quality gate, OCR,
                statement detection, line/normalize, validation, perf timer)
lib/validation/ zod schemas (single source of truth for input shapes)
lib/finance/    financial engine primitives: types, null-safe Decimal math,
                thresholds (EVERY tunable business constant lives here)
lib/review.ts   pure officer-workflow rules: transition legality, decision →
                status mapping, deterministic queue priority (unit-tested)
lib/pdf/        document layouts (Letter of Guarantee) — pure data → bytes
services/       business logic — the ONLY layer that touches Prisma
services/extraction-service.ts + services/extraction/  hybrid IFRS extraction
                (text-layer → GPT-Vision → OCR) and the async processing pipeline
services/finance/ pure deterministic engines (ratios, trends, flags,
                capacity, risk) + orchestrator; no I/O, no AI
services/decision/ Decision Intelligence: versioned prompt builder +
                service (cache, retries, zod validation, persistence);
                prompts NEVER live in UI
                (officer-case / review / note / guarantee services: the
                bank-side workflow — role-gated, never ownership-scoped)
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
                by the Sprint 2 parser); FK provenance link to its source
                Document (SetNull)
DecisionIntelligence  append-only AI memo rows (Sprint 4): frozen input
                snapshot + hash (response cache), provider/model/prompt
                provenance, validated memo fields, policy recommendation +
                flagged AI divergence
OfficerDecision append-only officer decisions (Sprint 5): officer, decision,
                mandatory reason, conditions, id of the memo reviewed
CaseNote        bank-internal notes (Sprint 5) — never in contractor queries
Guarantee       issued Letter of Guarantee (Sprint 5): 1:1 case, LG reference
                minted from internal seq, particulars frozen at issue time;
                PDF rendered on demand, never stored
AuditLog        append-only actor/action/detail trail (no update/delete paths)
```

Deliberately absent: Open Banking / SIMAH (Future — interfaces + mocks only).

## Financial analysis is computed on demand (decision 2026-07-06)

There is **no `FinancialAnalysis` table**. The Financial Intelligence Engine
(`services/finance/`, see `docs/FINANCIAL_ENGINE.md`) is a set of cheap,
pure, deterministic functions — the same `FinancialStatement` +
`ContractDetails` rows always produce the same analysis, so it is recomputed
on every page view and can never be stale. When the AI Underwriter and
officer decisions arrive, they need an immutable record of what they looked
at — that sprint introduces persisted **Analysis Snapshots** (not built yet,
by decision).

## The case status state machine

`DRAFT → PROCESSING → ANALYSIS_READY → UNDER_REVIEW →
(APPROVED → ISSUED) | DECLINED | INFO_REQUESTED (→ UNDER_REVIEW)`
with `PROCESSING → PROCESSING_FAILED` (retryable) on a Stage-1 failure.

The full enum exists from Sprint 0 (it is core domain vocabulary and avoids
migration churn). DRAFT arrived in Sprint 1. **Submission is decoupled from
processing** (post-MVP async redesign): `submitCase` moves the case
`DRAFT → PROCESSING` in one short transaction and enqueues a job — it never
runs extraction. The async pipeline (`case-processing-service`) then drives
`PROCESSING → ANALYSIS_READY` (or `PROCESSING_FAILED`) in two stages; see
`docs/ASYNC_PROCESSING.md`. The Sprint 5 officer workspace drives everything
after (ANALYSIS_READY → UNDER_REVIEW → APPROVED/DECLINED/INFO_REQUESTED →
ISSUED). Transition legality is pure code in `lib/review.ts`; the case and
review services enforce it — never UI.

(The `SUBMITTED` and `PARSING` enum values remain for historical rows and
labels; the live flow uses `PROCESSING`.)

## Processing pipeline & underwriting modes

Financial processing is a **two-stage async pipeline**, independent of
submission (`docs/ASYNC_PROCESSING.md`): Stage 1 (hybrid extraction →
deterministic engine) flips the case to ANALYSIS_READY with a live underwriting
headline in seconds; Stage 2 (the AI memo) runs in the background and never
gates readiness. `UNDERWRITING_MODE` (default `express`) controls document
scope + memo timing only — the deterministic engines are identical: **express**
reads the latest statement and generates the memo lazily on first officer open;
**comprehensive** reads all years and generates the memo eagerly. Extraction
itself is hybrid — text-layer first, GPT-Vision for scanned/damaged pages, OCR
last (`docs/IFRS_ENGINE.md`).

Access is two disjoint paths: contractors are **ownership-scoped**
(`case-service`), bank staff are **role-gated** (`officer-case-service` and
friends) and see every post-submission case. The AI memo, internal notes,
and the Underwriting Package are bank-internal — contractor queries never
include them (decision status, request-info messages, and approval
conditions are the applicant-visible surface).

## Security posture (lessons from V1 — do not regress)

- Sessions are **signed and verified** server-side (V1 shipped unverified JWT
  claims — never again).
- Every data access is scoped by role AND ownership in the service layer.
- Uploads: allowlisted types, size caps, **server-generated storage keys** —
  the client filename is metadata only, never a path.
- Files are served through authenticated routes, never public URLs.
- Secrets only via environment variables; `.env` is git-ignored,
  `.env.example` documents every variable.

## Decision Intelligence (Sprint 4)

The AI layer explains the deterministic analysis; it never calculates and
never decides. Pipeline, provider abstraction, prompt design, validation,
and failure handling: `docs/DECISION_INTELLIGENCE.md`. Key invariants:

- The model receives structured engine-output JSON only — never PDFs, never
  raw statements, never personal contact data.
- Every response passes a strict zod contract or is rejected and retried.
- The recommendation of record is bank policy (risk band mapping in
  `lib/finance/thresholds.ts`); model divergence is stored and flagged.
- No API key → MockProvider; the app is always deployable without AI.

## Future integration sockets

Open Banking and SIMAH will plug in as TypeScript interfaces
(`ExposureProvider`, `CreditBureauProvider`) with mock implementations. No
real integration code in the MVP.
