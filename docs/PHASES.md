# Daman — Delivery Phases

The MVP is delivered in sprints (see `TODO.md` for the task-level roadmap).
Every sprint ends with a deployable application.

| Sprint | Name | Delivers |
| --- | --- | --- |
| 0 | Foundation | Repo, PostgreSQL + Prisma schema, authentication, app shell, design system |
| 1 | Authentication hardening | Completes any auth scope not landed in Sprint 0 |
| 2 | Enterprise Dashboard | Statistics cards, recent cases, role-aware navigation |
| 3 | Underwriting Case Wizard | Case lifecycle (draft → submitted), contract details, IFRS upload |
| 4 | IFRS Parsing | Deterministic statement extraction into structured figures |
| 5 | Financial Intelligence Engine | Ratios, trends, flags, capacity, risk score — pure TS, unit-tested |
| 6 | AI Underwriter | Memo, summary, recommendation surfacing (LLM explains, never calculates) |
| 7 | Risk Officer Workspace | Queue, review page, approve / decline / request-info, audit timeline |
| 8 | Letter of Guarantee | Guarantee registry, professional PDF, audit report |

## Phase discipline

- Only the current sprint's scope is implemented.
- Financial analysis tables, AI tables, and integration tables are created in
  their own sprints — never earlier.
- Open Banking and SIMAH remain interfaces + mocks (`Future`), never real
  implementations in the MVP.
