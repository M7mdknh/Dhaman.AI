---
name: verify
description: Build, launch, and drive the Daman app to verify a change end-to-end (prod server + Playwright).
---

# Verifying Daman changes

Node is not on the non-interactive PATH — prefix every command:
`export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`

## Build & launch

- `npm run build` (prisma generate + next build). `next dev` is unreliable here
  (low inotify watches) — always verify against the production server.
- `PORT=3111 npm start` in the background; wait for
  `curl -s localhost:3111/api/health` → 200. Before starting, check for stale
  `next-server` processes holding the port (`ss -tlnp | grep 3111`), kill with
  `fuser -k 3111/tcp` (needs sandbox disabled).
- The database is remote Neon (`DATABASE_URL`) — CLI latency ≫ app latency, and
  cold connects can transiently `ETIMEDOUT`; just retry.

## Demo logins (password `Daman!2026`)

- `contractor@daman.local` (Rawabi), `contractor.nimah@daman.local`,
  `contractor.faisal@daman.local`
- `rm@daman.local` and `officer@daman.local` (both Relationship Managers —
  the Risk Officer login is retired; only `admin@daman.local` can record
  decisions and issue guarantees)

## Creating test cases

Fastest realistic path is the service layer (same code the app runs), modeled
on `scripts/seed-demo-cases.mts`: `createDraftCase` → `saveContractDetails` →
`addFinancialStatement` (PDF from `tests/fixtures/pdf-writer` +
`statement-text` + `company-profiles`) → `submitCase` → `runCaseProcessing`.
Delete test cases afterwards (`prisma.underwritingCase.deleteMany`; issued
guarantees RESTRICT — delete them first). Keep the three canonical demo cases
(Rawabi strong / Nimah moderate / Faisal weak) in ANALYSIS_READY.

## Driving the UI

Playwright + Chromium are installed. Scripts must live inside the repo (module
resolution) — e.g. `scripts/.verify-*.mts`, run with `npx tsx`, delete after.

Gotchas:
- Dashboards stream: after `waitForURL("**/dashboard")`, also
  `waitForSelector("text=Welcome,")` before counting elements or you race the
  loading skeleton.
- Form selects are custom comboboxes (`role=combobox` button): `.click()` then
  `getByRole("option", { name })` — `selectOption` does not work.
- Target buttons by accessible name, never bare `button[type=submit]` (the
  topbar sign-out is one and you'll log yourself out).
- Confirmation dialogs: click the trigger, then the same-named button inside
  `getByRole("dialog")`.
- Collect `console`/`pageerror` events; the walkthrough should end with zero.
