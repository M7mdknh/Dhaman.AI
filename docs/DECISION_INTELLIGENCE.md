# Decision Intelligence Engine

Sprint 4. The AI layer of Daman: it **explains** the deterministic financial
intelligence for the Risk Officer. It never calculates, never invents, and
never decides — the recommendation of record is derived deterministically
from the risk band by bank policy, and the final decision always rests with
the Risk Officer.

## The pipeline

```
UnderwritingCase + ContractDetails + FinancialStatement rows
      ↓  buildFinancialIntelligence          (deterministic engines, Sprint 3)
      ↓  prompt-builder                       structured JSON input — never PDFs,
                                              never raw statements, no personal data
DecisionIntelligenceService
      ↓  response cache (input hash)          identical inputs ⇒ no repeat call
      ↓  LLMProvider.completeJSON()           with retries + backoff
      ↓  zod validation                       invalid responses are rejected
      ↓  policy cross-check                   model recommendation vs bank policy
      ↓  DecisionIntelligence row             frozen input snapshot + validated memo
      ↓  AuditLog                             generated / failed, always recorded
Case page “Decision Intelligence” + /cases/[id]/package report
```

Everything above the provider interface is vendor-agnostic. The UI renders
persisted rows only — it never sees provider or prompt logic.

## Provider architecture

`src/lib/ai/`:

| File | Role |
| --- | --- |
| `provider.ts` | `LLMProvider` interface — one method, `completeJSON(request)` — plus typed `LLMProviderError` (`AUTH`, `RATE_LIMIT`, `TIMEOUT`, `NETWORK`, `BAD_RESPONSE`) with a `retryable` flag |
| `openai-provider.ts` | Chat Completions via plain `fetch` (no SDK), JSON mode, AbortController timeout, HTTP status → error-kind mapping |
| `mock-provider.ts` | Deterministic template memo assembled from the SAME structured input; every sentence prefixed `[Deterministic draft …]` so it can never be mistaken for model output |
| `index.ts` | `getLLMProvider()` — the only place concrete providers are known |

Selection: `LLM_PROVIDER=mock` forces the mock; otherwise `OPENAI_API_KEY`
present ⇒ OpenAI, absent ⇒ mock. **A missing key never crashes anything** —
the application stays deployable and demoable with no AI configured.

### Adding a future provider (Claude, Azure OpenAI, Gemini, …)

1. Implement `LLMProvider` in `src/lib/ai/<name>-provider.ts` (map the
   vendor's failures onto the five `LLMErrorKind`s).
2. Register it in `getLLMProvider()` with whatever env vars it needs.

No other file changes — the service, prompts, validation, cache, UI, and
persistence are all provider-agnostic. The provider name/model are stored on
every memo, so mixed histories stay attributable.

## Prompt design

`src/services/decision/prompt-builder.ts` is the only place prompt text or
input shaping exists (never in UI, never duplicated).

- **System prompt** (versioned, `PROMPT_VERSION`): Senior Corporate Credit
  Underwriter at Alinma Bank; assists a Risk Officer; never makes the final
  decision; the nine tasks (company summary, contract summary, strengths,
  weaknesses, trends, risk flags, contract-vs-capacity, recommendation,
  missing information); JSON-only output with the exact shape; never
  calculate; never invent.
- **User message**: one structured JSON object — company registration data
  (contact person/email/phone deliberately excluded), contract, ratios
  grouped by category (liquidity / leverage / profitability / efficiency /
  cash flow & coverage) per fiscal year, growth, trend directions, risk
  flags, underwriting capacity and risk score with their full component
  breakdowns, and `bankPolicy` (risk band + the policy recommendation).
  All money values are decimal strings. **Never PDFs, never raw statement
  rows** — only engine outputs.
- **Recommendation discipline**: bank policy maps the risk band to the
  recommendation (`RECOMMENDATION_BY_BAND` in `lib/finance/thresholds.ts`:
  EXCELLENT/LOW → Approve, MODERATE → Approve with Conditions, HIGH → Manual
  Review, CRITICAL → Reject). The input hands the model that value; the model
  must echo and explain it. If the model returns anything else, the policy
  value is stored as the recommendation of record, the model's value is kept
  in `aiRecommendation`, and `aiDiverged` flags the row — surfaced in the UI
  as a review warning. This reconciles the Sprint 4 JSON contract with the
  standing rule that the recommendation is never chosen by the model.

Bump `PROMPT_VERSION` on any prompt or input-shape change — it participates
in the cache key, so stale cached memos are never returned for a new prompt.

## Response validation

`src/lib/validation/decision.ts` — a **strict** zod schema over the ten
required fields (`summary`, `companyStrengths`, `companyWeaknesses`,
`contractAssessment`, `riskExplanation`, `recommendation`,
`recommendationReason`, `missingInformation`, `confidenceExplanation`,
`nextSteps`): unknown fields rejected, empty strings/lists rejected, length
caps applied, recommendation restricted to the four-value enum.
`parseDecisionResponse` tolerates code fences defensively, but anything that
fails the schema is rejected and retried — never patched up, never persisted.

## Failure handling

| Failure | Behavior |
| --- | --- |
| Missing API key | MockProvider selected at startup — never an error |
| Invalid key (401/403) | `AUTH`, **no retry**, user told to check the key |
| Rate limit (429) | `RATE_LIMIT`, retried with backoff (1s, 3s) |
| Timeout (`LLM_TIMEOUT_MS`, default 45s) | `TIMEOUT`, retried |
| Network failure | `NETWORK`, retried |
| 5xx / empty / non-JSON / schema-invalid | `BAD_RESPONSE`, retried |

3 attempts total. Every terminal failure writes a `case.decision_failed`
audit row and returns a clean, user-facing message with a retry button —
runtime failures are **never** silently downgraded to the mock provider
(a bank must never mistake template text for model output).

## Persistence & cache

`DecisionIntelligence` rows are append-only; the newest row is the active
memo. Each row freezes:

- `inputSnapshot` — the exact structured input the model saw (this is the
  immutable analysis snapshot the memo explains),
- `inputHash` — sha256(input + prompt version + provider + model): the
  response-cache key. Regenerating with unchanged engine output reuses the
  stored memo with **no provider call**; any change in figures, thresholds,
  prompt, or model produces a new hash and a fresh generation,
- provider, model, prompt version, latency, requesting user,
- the ten validated memo fields + `recommendation` (policy),
  `aiRecommendation`, `aiDiverged`.

Only validated responses are persisted. Failures exist solely in the audit
log.

## UI

- **Case details page** — “Decision Intelligence” panel: executive summary,
  strengths/weaknesses, recommendation badge (labeled *derived from the
  computed risk band*), missing information, next steps, confidence,
  provider/model/prompt provenance footer, divergence and mock-provider
  notices, generate/regenerate actions.
- **`/cases/[id]/package`** — the professional Underwriting Package:
  Executive Summary, Company Overview, Contract Overview, Financial
  Highlights, Major Risks, Positive Indicators, Financial Trends,
  Recommendation, Missing Information. Every section carries a provenance
  chip — **Computed** (deterministic engines) or **AI-drafted** — and the
  letterhead states the division of labor explicitly. Print-friendly.

## Tests

`tests/decision/` — prompt builder (structure, exclusions, determinism,
policy embedding), response schema (accept/reject/fences), mock provider
(schema-valid, deterministic, policy echo), retry policy (invalid-then-valid
recovers, retryable caps at 3 attempts, AUTH never retried). Run `npm test`.
