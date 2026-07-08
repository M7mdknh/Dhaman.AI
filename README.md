# Daman

> AI-Powered Corporate Underwriting Platform for Saudi Banks

---

## Vision

Daman is an AI-powered underwriting platform that helps banks evaluate Letter of Guarantee (LG) requests in minutes instead of days.

The platform does **not** replace the bank.

Instead, it prepares a complete underwriting package for the Risk Officer by combining deterministic financial analysis with AI-generated explanations. Document extraction is only one component — the product optimizes for delivering underwriting value quickly.

The bank always makes the final decision.

---

## Problem

Today issuing a Letter of Guarantee is mostly manual.

Relationship Managers collect financial statements.

Risk Officers manually calculate financial ratios.

Credit memos are written manually.

The process often takes several days.

---

## Solution

Daman automates the underwriting preparation process.

The company submits

- Company information
- Contract information
- Audited IFRS Financial Statements (latest year required; previous years optional)

The platform

- Extracts financial statements
- Calculates financial ratios
- Detects financial trends
- Identifies financial risks
- Generates an underwriting memo

The Risk Officer receives a decision-ready underwriting package.

---

## Underwriting Modes

The platform supports two business workflows (`UNDERWRITING_MODE`, default
`express`). The deterministic engines are identical in both — only document
scope and AI-memo timing change.

**⚡ Express Underwriting (default)** — a meaningful underwriting assessment
in seconds. Only the latest audited statement is read (its comparative column
still yields ≥2 years of trend); the deterministic Financial Intelligence and
Underwriting Capacity headline appear the moment extraction finishes, and the
AI memo is generated lazily on the first Risk Officer open — never on the
contractor's path.

**📊 Comprehensive Underwriting** — production-grade: every uploaded fiscal
year is extracted for full historical trend analysis, and the AI memo is
generated eagerly in the background. May take significantly longer.

---

## Current MVP Scope

Delivered (Sprint 0 — Foundation)

- Authentication (register, login, logout — roles: Contractor, Risk Officer, Admin)
- Application shell (sidebar, top bar, protected routes, banking design system)
- Database foundation (7 core models, initial migration, seed data)

Delivered (Sprint 1 — Contractor Workspace)

- Contractor dashboard (statistics, cases table, instant search + filters)
- Underwriting case wizard (company info → contract details → IFRS upload → review)
- Draft lifecycle (save, resume, edit, delete) and submission (read-only after)
- Audited IFRS statement upload (PDF, per fiscal year, authenticated download)
- Case details page with a growable lifecycle timeline
- Full audit trail for every business action

Delivered (Sprint 2 — IFRS Parsing, since upgraded to hybrid extraction)

- Hybrid statement extraction: deterministic text-layer parsing first
  (MuPDF WASM — digital PDFs, ~1s, no network), GPT-Vision on statement-page
  images for scanned/damaged documents, tesseract.js OCR as the last-resort
  fallback. Vision reads documents only — it never calculates, and
  vision-sourced figures are flagged for officer verification
- Line-item normalization into structured figures, one row per fiscal year
- Extraction runs asynchronously after submission (see the async-processing
  note below); per-file failure messages; extraction provenance
- Extracted-figures review UI (see `docs/IFRS_ENGINE.md`)

Delivered (Sprint 3 — Financial Intelligence Engine)

- Pure deterministic TypeScript engines: 19 ratios, YoY growth, trends,
  13 rule-based risk flags — every threshold configurable, no AI in any figure
- Underwriting Capacity (primary KPI) + Risk Score with five risk bands
- Analysis dashboard: capacity, risk gauge, KPI strip, flags, trend charts,
  ratio tables (see `docs/FINANCIAL_ENGINE.md`)

Delivered (Sprint 4 — AI Underwriter / Decision Intelligence)

- Provider-agnostic LLM layer: OpenAI or a deterministic mock — no API key
  needed, the app always runs
- AI underwriting memo (executive summary, strengths, weaknesses, risks,
  missing information, next steps), strictly validated before persistence
- Recommendation derived deterministically from the risk band by bank
  policy — never by the model; divergence is stored and flagged
- Professional Underwriting Package report with Computed vs AI-drafted
  provenance labels (see `docs/DECISION_INTELLIGENCE.md`)

Delivered (Sprint 5 — Underwriting Workspace)

- Risk Officer review queue (pending/all/decided, search, pagination,
  deterministic priority) and a three-column review workspace: timeline,
  full financial intelligence + AI memo, sticky decision sidebar
- Officer decisions as data: Approve / Approve with Conditions / Reject /
  Request More Information — mandatory reason, confirmation, full audit
- Internal notes (bank-only); contractors see decision status, request-info
  messages, and approval conditions — never internal reasoning or the memo
- Letter of Guarantee: unique LG reference, professional PDF with QR stamp,
  rendered on demand behind an authenticated route
  (see `docs/UNDERWRITING_WORKSPACE.md`)

This completes the MVP scope (the formerly planned guarantee registry &
exportable audit report were cancelled by user decision, 2026-07-07).

Delivered (Post-MVP — Express Underwriting & speed, 2026-07-08)

- Two-stage async pipeline: Stage 1 (extract → deterministic analysis) flips
  the case to ANALYSIS_READY with a live underwriting headline (Capacity,
  Rating, Financial Health, Risk Level, Recommendation) in ~2–3s; Stage 2
  (the AI memo) runs in the background and never gates readiness
- Express / Comprehensive underwriting modes (`UNDERWRITING_MODE`)
- Lazy AI memo: in express mode the memo is generated on first officer open
  (idempotent, deduplicated) or via the explicit "Generate AI Analysis" button
- Hybrid GPT-Vision extraction for scanned statements; connection-pool
  warming; critical-path round-trip collapse (measured Stage 1 ~2.4s on
  remote Neon + R2)

Future

- Deep Extraction (production-grade document AI for scanned Arabic statements)
- Saudi Open Banking
- SIMAH
- Core Banking Integration

---

## Tech Stack

Full-stack TypeScript — one codebase, one deployable.

Application

- Next.js 15 (App Router — UI, route handlers, server actions)
- TypeScript
- TailwindCSS
- shadcn/ui

Database

- PostgreSQL
- Prisma ORM

AI

- Provider-agnostic LLM layer (`lib/ai/`) — OpenAI today, deterministic mock
  when no key is configured; document understanding (vision extraction of
  scanned statements) and memo drafting only — never calculations, never the
  final decision

Deployment

- Vercel
- Managed PostgreSQL (e.g. Railway / Neon)

---

## Getting Started

Prerequisites: Node.js 20+ and a PostgreSQL 14+ database. Any managed Postgres
works (the project runs on Neon); for a local instance, create a role/database
and point `DATABASE_URL` at it:

```sql
CREATE ROLE daman LOGIN PASSWORD 'daman_dev' CREATEDB;
CREATE DATABASE daman OWNER daman;
```

```bash
npm install
cp .env.example .env        # set DATABASE_URL + SESSION_SECRET (openssl rand -base64 32)
npx prisma migrate deploy   # apply migrations
npm run db:seed             # demo users + companies (blocked in production)
npm run dev                 # http://localhost:3000
```

AI is optional: set `OPENAI_API_KEY` to use OpenAI; without it the app runs
with a clearly-labeled deterministic mock provider (see `.env.example`).

### Deploying (Vercel Hobby-compatible — no cron, no paid features)

Financial processing runs asynchronously in two stages, decoupled from
submission:

- **Submit** persists the case, marks it `PROCESSING`, and starts the pipeline
  immediately in the background via Next.js `after()` — the user is never
  blocked on extraction or AI. **Stage 1** (extract → deterministic analysis)
  flips the case to `ANALYSIS_READY` with a live underwriting headline in a few
  seconds; **Stage 2** (the AI memo) runs in the background and never gates
  readiness. The case page shows live stage progress; a lost trigger self-heals
  on the next status check, and a stalled run offers a one-click **Retry
  Analysis**. No cron and no scheduled jobs are used.
- Set `S3_BUCKET` (+ credentials) — the read-only serverless filesystem cannot
  persist uploads; production refuses to boot on local disk otherwise.
- Optionally set `TESSERACT_LANG_PATH` to a private traineddata mirror to drop
  the runtime CDN dependency for OCR. See `.env.example` for the full list.

### Demo accounts

| Email | Role | Password |
| --- | --- | --- |
| admin@daman.local | Admin | `Daman!2026` |
| officer@daman.local | Risk Officer | `Daman!2026` |
| contractor@daman.local | Contractor | `Daman!2026` |

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run db:migrate` / `db:seed` / `db:studio` | Prisma workflows |

Project documentation: `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`,
`docs/PHASES.md`, `docs/IFRS_ENGINE.md`, `docs/FINANCIAL_ENGINE.md`,
`docs/DECISION_INTELLIGENCE.md`, `docs/UNDERWRITING_WORKSPACE.md`,
`docs/ASYNC_PROCESSING.md`, `TODO.md`, `PROJECT_STATUS.md`, `TECH_DEBT.md`.

---

## Product Philosophy

Daman is an AI-powered underwriting platform, not an OCR engine — it
optimizes for delivering a believable underwriting assessment quickly.

Financial calculations are always deterministic. The AI is used only for
document understanding and to explain the analysis — it never calculates.

The AI never replaces the Risk Officer.
