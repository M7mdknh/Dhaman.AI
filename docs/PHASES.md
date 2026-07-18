# Dhaman — Delivery Phases

The MVP is delivered in sprints (see `TODO.md` for the task-level roadmap).
Every sprint ends with a deployable application.

| Sprint | Name | Delivers |
| --- | --- | --- |
| 0 ✅ | Foundation | Repo, PostgreSQL + Prisma schema, authentication, app shell, design system |
| 1 ✅ | Contractor Workspace | Dashboard (stats, search, filters) + full case wizard: company info, contract details, IFRS upload, review, submit, case details, audit trail |
| 2 ✅ | IFRS Parsing | Deterministic statement extraction into structured figures |
| 3 ✅ | Financial Intelligence Engine | Ratios, trends, flags, capacity, risk score — pure TS, unit-tested |
| 4 ✅ | AI Underwriter | Memo, summary, recommendation surfacing (LLM explains, never calculates) |
| 5 ✅ | Underwriting Workspace | Officer queue, review workspace, decisions + internal notes, audit — PLUS Letter of Guarantee generation (absorbed from Sprint 6 by user directive 2026-07-07) |
| ~~6~~ | ~~Guarantee Registry & Audit Reporting~~ | Cancelled by user decision 2026-07-07 — the MVP is complete at Sprint 5 |
| P ✅ | Post-MVP: Speed & Experience (2026-07-08) | Express / Comprehensive underwriting modes, two-stage background pipeline (deterministic headline in seconds, AI memo in the background), lazy AI memo, hybrid GPT-Vision extraction. No schema migration. |

Sprint 1 was re-scoped by user directive (2026-07-06): it absorbed the former
"Enterprise Dashboard" and "Underwriting Case Wizard" sprints; auth hardening
moved to the backlog in `TODO.md`. Sprint 5 was re-scoped by user directive
(2026-07-07): it absorbed Letter of Guarantee generation from Sprint 6.
Sprint 6 was cancelled by user decision (2026-07-07): **the roadmap ends at
Sprint 5** — the guarantee registry and exportable audit report will not be
built.

The MVP is complete at Sprint 5. Post-MVP work (2026-07-08) re-optimized the
platform for the Express Underwriting experience without adding schema — the
product is an AI-powered underwriting platform, not an IFRS parser, and
optimizes for delivering underwriting value quickly.

## Phase discipline

- Only the current phase's scope is implemented.
- Financial analysis tables, AI tables, and integration tables are created in
  their own sprints — never earlier.
- Deep Extraction, Open Banking, and SIMAH remain `Future` (interfaces + mocks
  only for the integrations), never real implementations in the MVP.
