# Daman

> AI-Assisted Corporate Underwriting Platform for Saudi Banks

---

## Vision

Daman is an AI-assisted underwriting platform that helps banks evaluate Letter of Guarantee (LG) requests in minutes instead of days.

The platform does **not** replace the bank.

Instead, it prepares a complete underwriting package for the Risk Officer by combining deterministic financial analysis with AI-generated explanations.

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
- Audited IFRS Financial Statements

The platform

- Extracts financial statements
- Calculates financial ratios
- Detects financial trends
- Identifies financial risks
- Generates an underwriting memo

The Risk Officer receives a decision-ready underwriting package.

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

Delivered (Sprint 2 — IFRS Parsing)

- Deterministic PDF statement extraction (MuPDF WASM — no LLM, no OCR)
- Line-item normalization into structured figures, one row per fiscal year
- Parsing runs at submission; per-file failure messages; extraction provenance
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

Future

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
  when no key is configured; explanations and memo drafting only — never
  calculations, never the final decision

Deployment

- Vercel
- Managed PostgreSQL (e.g. Railway / Neon)

---

## Getting Started

Prerequisites: Node.js 20+, PostgreSQL 14+ with a `daman` role and database:

```sql
CREATE ROLE daman LOGIN PASSWORD 'daman_dev' CREATEDB;
CREATE DATABASE daman OWNER daman;
```

```bash
npm install
cp .env.example .env        # set SESSION_SECRET (openssl rand -base64 32)
npx prisma migrate deploy   # apply migrations
npm run db:seed             # demo users + companies
npm run dev                 # http://localhost:3000
```

AI is optional: set `OPENAI_API_KEY` to use OpenAI; without it the app runs
with a clearly-labeled deterministic mock provider (see `.env.example`).

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
`TODO.md`, `PROJECT_STATUS.md`, `TECH_DEBT.md`.

---

## Product Philosophy

Financial calculations should always be deterministic.

The AI explains the financial analysis.

The AI never replaces the Risk Officer.
