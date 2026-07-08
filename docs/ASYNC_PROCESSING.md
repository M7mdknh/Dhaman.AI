# Async Financial Processing

Submitting an underwriting case and processing its financial statements are
**two separate business operations** and are implemented as two completely
independent workflows. The user is never blocked on OCR, parsing, or AI.

## The two workflows

### 1. Submission — synchronous, seconds

`submitCase` (`services/case-service.ts`) does one short, atomic transaction and
returns. It never runs the pipeline.

```
DRAFT ──submit──▶ PROCESSING     (submittedAt set)
                  • documents → QUEUED
                  • CaseProcessing job created (state = QUEUED)
                  • audit: case.submitted
```

`submitCaseAction` then schedules the pipeline **out-of-band** with Next.js
`after()` and returns `{ ok: true }`; the client redirects to the case page.
The heavy work happens after the response is already sent.

### 2. Processing — asynchronous, durable, retryable

`runCaseProcessing` (`services/case-processing-service.ts`) is a self-claiming,
idempotent orchestrator driven by the `CaseProcessing` job row.

```
claim (QUEUED → RUNNING, attempts++)          ← only one runner wins the claim
  ┌─ STAGE 1 — Fast Financial Intelligence (target ≤3s) ────────────────┐
  │ ├ READING_STATEMENTS ┐                                              │
  │ ├ DETECTING_STATEMENTS│  the IFRS pipeline (processCaseDocuments)    │
  │ ├ EXTRACTING_DATA    ┘                                              │
  │ └ FINANCIAL_ANALYSIS     deterministic engine → underwriting HEADLINE│
  │        → case ANALYSIS_READY NOW  (reviewable; headline shown)       │
  └─────────────────────────────────────────────────────────────────────┘
  ┌─ STAGE 2 — Deep Financial Intelligence (background; whole pipe ≤10s) ┐
  │ └ AI_UNDERWRITING        the AI memo — best-effort, never gates       │
  └─────────────────────────────────────────────────────────────────────┘
COMPLETED  → job done (case already ANALYSIS_READY since end of Stage 1)
FAILED     → case PROCESSING_FAILED   (Stage-1 failure only; case stays saved)
```

**The pipeline is TWO stages** (docs rationale: "results in <3s, package in <10s"):

- **Stage 1 — Fast Financial Intelligence.** Extract statement figures (statement
  pages only, cached across retries) → the deterministic engine. The case flips
  to **ANALYSIS_READY the instant Stage 1 finishes**, and the underwriting
  HEADLINE — Underwriting Capacity /100, Rating (AAA…CCC), Financial Health /100,
  Risk Level, Recommendation — is available (`lib/finance/headline.ts`,
  `deriveHeadline`). The user already feels the analysis is complete.
- **Stage 2 — Deep Financial Intelligence.** The job keeps RUNNING and generates
  the AI memo in the **background**. It never gates readiness: a slow/failed LLM
  leaves the case ANALYSIS_READY and the contractor never waits for GPT.

**Critical-path discipline (why Stage 1 is fast):** the deterministic engine is
~1ms; the cost is I/O. So Stage 1 avoids needless DB round-trips — the pipeline
returns the just-persisted `FinancialStatement` rows (`createManyAndReturn`) so
analysis needs no case re-read, and stage-progress writes (`advanceTo`) are
FIRE-AND-FORGET (observational, never blocking). The headline is surfaced live
by the poll payload (`getProcessingViewForOwner` → `{ ...snapshot, headline }`),
so no full page reload is needed to show results.

The job row is the durable, observable, retryable record of the work. Stage
progress is written to it as the pipeline advances (monotonically — the
extraction phase reports Reading/Detecting/Extracting per document, and the
orchestrator only ever moves the dashboard forward).

## Why the two are decoupled

Before this redesign `submitCase` ran `processCaseDocuments` **inline, before
the case left DRAFT**. The user waited for OCR, and any extraction failure
failed the whole submission — the case was never saved. Submission is now just
"save + enqueue"; processing is a separate job.

## Failure handling — work is never lost

- A failure in a **gating stage** (reading → detecting → extracting → financial
  analysis) sets `CaseProcessing.state = FAILED` with the real `error` and the
  `failedStage`, and the case to `PROCESSING_FAILED`. The case row, its
  documents, and any extracted figures all remain saved.
- **Retry** (`retryProcessing` → `retryProcessingAction`) re-arms the job to
  QUEUED and re-runs the pipeline on the **same uploaded documents** — no
  re-upload required. Ownership-scoped to the case's contractor.
- **AI underwriting never gates readiness.** Per the product principle "the AI
  assists the bank, it never replaces it", a flaky/slow external LLM must not
  block underwriting. It runs only in Stage 2 (background) and a Stage-2 failure
  leaves the case ANALYSIS_READY; only Stage 1 (the deterministic pipeline) gates
  readiness.

## The AI memo — background in Stage 2, never on the user's path

The AI-drafted underwriting memo (`DecisionIntelligence`) is generated from three
places, none of which the contractor ever waits on:

1. **Stage 2 of processing (background).** After Stage 1 flips the case to
   ANALYSIS_READY, the same job runs `runDecisionIntelligence(caseId, null)` in
   the background, then marks the job COMPLETED. Best-effort — a failure is
   audited (`case.decision_deferred`) and leaves the case ANALYSIS_READY.
2. **A Risk Officer opens the case.** `review/[id]/page.tsx` fires
   `ensureDecisionIntelligence(caseId)` in a Next.js `after()` — idempotent, a
   no-op once a memo exists, and de-duplicates concurrent opens. Acts as the
   safety net if Stage 2 was deferred (e.g. an LLM rate-limit).
3. **Explicit "Generate AI Analysis".** `generateDecisionAction` →
   `generateDecisionIntelligence` (officer-gated), unchanged.

All funnel through `runDecisionIntelligence`, whose `inputHash` cache means a
repeat over the same engine output + prompt + model reuses the stored memo
rather than calling the provider again.

## Live progress — "Preparing your underwriting package"

The case page renders `ProcessingDashboard` while the JOB is active (QUEUED /
RUNNING — which now spans Stage 2, even after the case is ANALYSIS_READY) or
failed. It polls `GET /api/cases/[caseId]/processing` (ownership-scoped),
returning `{ ...snapshot, headline }`, and shows:

- **Overall progress** + **estimated remaining time** + **current step** +
  **completed steps** (`deriveProgress` in `lib/processing.ts`, weighted by
  nominal stage durations — Stage 2/AI is the long pole).
- The **underwriting headline** (`UnderwritingHeadlineCard`) the instant Stage 1
  completes — Capacity /100, Rating, Health /100, Risk Level, Recommendation —
  so results appear without any page reload while Stage 2 finishes.

```
✨ Preparing your underwriting package        [██████░░]  72% · ~7s left
  ✓ Case Submitted        ✓ Reading / Detecting / Extracting
  ✓ Documents Uploaded    ✓ Financial Analysis      ⟳ AI Underwriting Memo
  ┌ Underwriting headline: Capacity 82/100 · AA · Health 79/100 · Low · Approve ┐
```

On COMPLETED the page refreshes to the full analysis. On failure (Stage 1 only)
it shows the real reason and a **Retry Analysis** button — the old "Processing
Stalled" wording is gone.

## Robustness

- **Idempotent claim.** `runCaseProcessing` only proceeds if it can atomically
  move the job QUEUED → RUNNING (`updateMany` guarded on state). Concurrent
  triggers (the submit `after()`, a poll self-heal, a retry) are safe no-ops.
- **Self-heal.** If the `after()` trigger is ever lost (e.g. a process restart
  between submit and run), the first dashboard poll re-triggers the run for a
  still-QUEUED job.
- **Stall detection.** A RUNNING job untouched for 5 minutes is reported as
  `stalled`; the dashboard offers Retry, which re-arms it.

## Key files

| Concern | File |
| --- | --- |
| Job model + enums | `prisma/schema.prisma` (`CaseProcessing`, `ProcessingStage`, `ProcessingState`) |
| Pure stage/step rules | `src/lib/processing.ts` |
| Orchestrator + retry + snapshot | `src/services/case-processing-service.ts` |
| Submission (save + enqueue) | `src/services/case-service.ts` (`submitCase`) |
| Triggers (`after()`) | `src/app/(app)/cases/actions.ts` |
| Poll endpoint (+ self-heal) | `src/app/api/cases/[caseId]/processing/route.ts` |
| Live dashboard | `src/components/cases/processing-dashboard.tsx` |
| Guard-free AI memo core | `src/services/decision/decision-intelligence-service.ts` (`runDecisionIntelligence`) |
