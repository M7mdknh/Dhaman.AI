# Underwriting Workspace

Sprint 5. The Risk Officer's review environment: everything needed to take a
submitted case from queue to a final decision — and, on approval, to an
issued Letter of Guarantee — without navigating anywhere else.

**The Risk Officer is the only decision maker.** The deterministic engines
compute, the AI explains, the officer decides. Nothing in this workspace
automates a decision.

## Workflow

```
Submitted case
   ↓ IFRS extraction (Sprint 2)             SUBMITTED → PARSING → ANALYSIS_READY
   ↓ appears in the officer queue           (dashboard, "Pending" tab, FIFO)
   ↓ officer opens /review/[id]             audited; viewing NEVER changes state
   ↓ Start Review (explicit, confirmed)     ANALYSIS_READY → UNDER_REVIEW
   |                                        first officer to start = assigned officer
   ↓ decision (mandatory reason, confirmed)
   |   Approve ────────────────────────────  → APPROVED
   |   Approve with Conditions (mandatory)   → APPROVED
   |   Reject ─────────────────────────────  → DECLINED
   |   Request More Information ───────────  → INFO_REQUESTED
   |        ↑ resume once info arrives       INFO_REQUESTED → UNDER_REVIEW
   |          (terminal decisions also allowed directly from INFO_REQUESTED)
   ↓ Issue Letter of Guarantee (confirmed)  APPROVED → ISSUED
```

Transition legality is pure code in `lib/review.ts` (unit-tested
exhaustively); `services/review-service.ts` enforces it against the DB.
"Manual Review" is deliberately NOT an officer decision — the officer in
this workspace IS the manual review; it exists only as an AI recommendation
value.

## The workspace (`/review/[id]`)

Three-column layout on large screens (stacks responsively):

- **Header band** — company, reference, status, guarantee type/amount,
  contract value, submission date, assigned officer, priority.
- **Left: timeline** — Created, Submitted, Financial Extraction, Financial
  Analysis, Decision Intelligence, Officer Review Started, Decision, Letter
  of Guarantee. Events appear automatically as they happen.
- **Center: the case** — Decision Intelligence memo (executive summary,
  strengths/weaknesses, policy recommendation, generate/regenerate), the
  full deterministic Financial Intelligence dashboard (capacity, risk gauge,
  KPI strip, flags, trend charts, ratio tables — the same
  `FinancialIntelligencePanel` the analysis page renders), company +
  contract overviews, and documents with processing status + authenticated
  preview.
- **Right (sticky): Officer Decision** — the state-appropriate action
  (Start Review / decision form / Resume Review / Issue Guarantee /
  download LG), the append-only decision record, and internal notes.

**Priority** is derived deterministically (`derivePriority` in
`lib/review.ts`, thresholds in `lib/finance/thresholds.ts`): HIGH for
HIGH/CRITICAL risk bands or guarantees ≥ SAR 10M, NORMAL ≥ SAR 1M, else
LOW. Never a hand-maintained field.

**The queue** (officer dashboard): Pending / All / Decided tabs, search
(reference, company, contract, beneficiary), server-side pagination,
capacity + risk + priority per row (recomputed on demand by the engines —
same freshness rule as everywhere else).

## Officer responsibilities

1. Review the deterministic analysis and the AI memo — the memo explains,
   it never decides; a flagged divergence means the model disagreed with
   bank policy and the policy value stands.
2. Inspect the source documents (every download is audited).
3. Record a decision with written reasoning (mandatory, stored, audited).
   Conditions are mandatory for a conditional approval and ARE shown to the
   applicant — internal reasoning is not.
4. Issue the Letter of Guarantee after approval.

## Decision lifecycle & data

- `OfficerDecision` rows are **append-only**: who, when, what, why, plus
  the conditions and the id of the AI memo the officer had on screen. A
  REQUEST_INFO can be followed by a terminal decision; the newest terminal
  row is the decision of record.
- `CaseNote` rows are bank-internal; no contractor-facing query includes
  them (`getOwnedCase` selects decision fields explicitly and never notes
  or the memo).
- The contractor sees: status, the request-for-information message, the
  approval conditions, the decision outcome, and the issued guarantee —
  never internal reasoning, notes, or the memo.

## Letter of Guarantee

`Guarantee` is 1:1 with a case, minted `LG-YYYY-NNNNNN` from an internal
sequence (same race-free pattern as case references). Particulars (amount,
beneficiary, expiry = contract end date) are **copied at issue time** — the
instrument stays as issued even if case data later changes. The PDF
(`lib/pdf/guarantee-pdf.ts`, pdf-lib) is rendered **on demand** from the
row — deterministic, nothing stored on disk — and served only through the
authenticated `/api/guarantees/[caseId]` route to bank staff and the owning
contractor. It carries reference, applicant, beneficiary, amount, issue and
expiry dates, the authorizing officer, and a QR stamp encoding the
particulars for verification.

## Audit catalog (Sprint 5 additions)

| Action | When |
| --- | --- |
| `officer.case_opened` | Workspace view (deduplicated per officer/case within 15 min so refreshes don't flood the trail) |
| `officer.review_started` | Start Review |
| `officer.review_resumed` | Resume after requested information |
| `officer.decided` | Every decision (detail: decision, target status, memo id) |
| `officer.note_added` | Internal note |
| `officer.document_downloaded` | Statement preview/download by bank staff |
| `guarantee.issued` | LG issuance (detail: reference, amount, expiry) |
| `guarantee.pdf_downloaded` | Every LG PDF download (officer or contractor) |

## Authorization

Officer entry points (`officer-case-service`, `review-service`,
`note-service`, `guarantee-service`, memo generation) all gate on
`RISK_OFFICER`/`ADMIN` via `getOfficerUser` — never on ownership. The
contractor path stays ownership-scoped and unchanged. The AI memo and the
Underwriting Package are officer-only since this sprint.
