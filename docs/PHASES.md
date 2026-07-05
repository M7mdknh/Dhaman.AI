# Daman — Delivery Phases

The MVP is delivered in sprints (see `TODO.md` for the task-level roadmap).
Every sprint ends with a deployable application.

| Sprint | Name | Delivers |
| --- | --- | --- |
| 0 ✅ | Foundation | Repo, PostgreSQL + Prisma schema, authentication, app shell, design system |
| 1 ✅ | Contractor Workspace | Dashboard (stats, search, filters) + full case wizard: company info, contract details, IFRS upload, review, submit, case details, audit trail |
| 2 | IFRS Parsing | Deterministic statement extraction into structured figures |
| 3 | Financial Intelligence Engine | Ratios, trends, flags, capacity, risk score — pure TS, unit-tested |
| 4 | AI Underwriter | Memo, summary, recommendation surfacing (LLM explains, never calculates) |
| 5 | Risk Officer Workspace | Queue, review page, approve / decline / request-info, audit timeline |
| 6 | Letter of Guarantee | Guarantee registry, professional PDF, audit report |

Sprint 1 was re-scoped by user directive (2026-07-06): it absorbed the former
"Enterprise Dashboard" and "Underwriting Case Wizard" sprints; auth hardening
moved to the backlog in `TODO.md`.

## Phase discipline

- Only the current sprint's scope is implemented.
- Financial analysis tables, AI tables, and integration tables are created in
  their own sprints — never earlier.
- Open Banking and SIMAH remain interfaces + mocks (`Future`), never real
  implementations in the MVP.
