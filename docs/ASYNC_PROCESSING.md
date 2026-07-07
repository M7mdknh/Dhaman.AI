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
  ├ READING_STATEMENTS ┐
  ├ DETECTING_STATEMENTS│  the IFRS pipeline (processCaseDocuments)
  ├ EXTRACTING_DATA    ┘
  ├ FINANCIAL_ANALYSIS     deterministic engine builds a report
  └ AI_UNDERWRITING        best-effort memo pre-generation
COMPLETED  → case ANALYSIS_READY
FAILED     → case PROCESSING_FAILED   (case + documents stay saved)
```

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
- **AI underwriting is best-effort by design.** Per the product principle "the
  AI assists the bank, it never replaces it", a flaky external LLM must not
  block underwriting. If memo pre-generation fails the case still reaches
  ANALYSIS_READY (audited as `case.decision_deferred`); the officer generates
  the memo on demand, exactly as before. Only the deterministic pipeline gates
  readiness.

## Live progress (the processing dashboard)

The case page renders `ProcessingDashboard` while the case is `PROCESSING` /
`PROCESSING_FAILED`. It polls `GET /api/cases/[caseId]/processing`
(ownership-scoped) and renders the ordered step checklist derived by the pure
`lib/processing.ts` (`buildProcessingSteps`):

```
✓ Case Submitted
✓ Documents Uploaded
⟳ Reading Financial Statements
⟳ Detecting Financial Statements
⟳ Extracting Financial Data
⟳ Financial Analysis
⟳ AI Underwriting
✓ Completed
```

On completion the page refreshes to reveal the analysis. On failure it shows the
real reason and a **Retry Analysis** button.

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
