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

Delivered (Sprint 0)

- Authentication (register, login, logout — roles: Contractor, Risk Officer, Admin)
- Application shell (sidebar, top bar, protected routes, banking design system)
- Database foundation (7 core models, initial migration, seed data)

In progress

- Company Dashboard
- Underwriting Case Creation
- Contract Details Form
- IFRS Financial Statement Upload

Coming next

- IFRS Parsing
- Financial Intelligence Engine
- AI Underwriter
- Officer Dashboard
- Letter of Guarantee Generation

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

- OpenAI GPT (explanations and memo drafting only — never calculations)

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
`docs/PHASES.md`, `TODO.md`, `PROJECT_STATUS.md`, `TECH_DEBT.md`.

---

## Product Philosophy

Financial calculations should always be deterministic.

The AI explains the financial analysis.

The AI never replaces the Risk Officer.
