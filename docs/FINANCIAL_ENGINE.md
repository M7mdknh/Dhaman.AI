# Financial Intelligence Engine

Sprint 3. Pure TypeScript, fully deterministic, fully unit-tested. The LLM is
never involved in any figure — the same financial statements and contract
always produce the same analysis.

Module map:

```
src/lib/finance/
  types.ts        shared types (YearFinancials, report, score shapes)
  decimal.ts      null-safe Decimal arithmetic (null degrades a metric, never the report)
  thresholds.ts   EVERY tunable constant — weights, clamps, flag triggers, band boundaries
src/services/finance/
  financial-integrity-validator.ts  the gate — rejects impossible figures BEFORE any engine runs
  financial-ratio-service.ts        ratios + YoY growth
  trend-analysis-service.ts         multi-year metric series + direction
  risk-flag-service.ts              rule-based red/amber findings with evidence
  execution-capacity-service.ts     Underwriting Capacity (primary KPI)
  risk-score-service.ts             Risk Score + band (secondary KPI)
  financial-intelligence-service.ts orchestrator — maps DB rows in, assembles the report
```

---

## Architectural decision: computed on demand, never persisted

**There is NO `FinancialAnalysis` table** (user decision 2026-07-06).

The analysis is recomputed from live `FinancialStatement` + `ContractDetails`
rows on every page view. The engines are cheap pure functions; determinism
guarantees the same statements always render the same analysis, so a stored
copy could only ever be redundant or stale.

When the AI Underwriter and officer decisions arrive (Sprint 4/5), they need
an **immutable input** — what exactly did the memo/decision look at? That
sprint introduces frozen **Analysis Snapshots** (persisted at memo-generation
/ decision time). Snapshot storage is deliberately NOT built yet.

## Principles

- **Decimal in, numbers out.** Money stays `Prisma.Decimal` end-to-end;
  dimensionless ratios/scores become `number` only after division
  (`lib/finance/decimal.ts` rounds at `RATIO_PRECISION = 4`).
- **Null degrades one metric, never the report.** A missing figure or zero
  denominator yields `null` ("—" in the UI), never `NaN`, never a throw.
- **Absence of data is reported, never scored.** Composite scores exclude
  incomputable components and renormalize the remaining weights; every
  exclusion is listed in `missingInputs` on the dashboard.
- **No business rules outside `thresholds.ts`.** Adjusting bank policy
  (weights, clamps, band boundaries, flag triggers) means editing that one
  file only.
- **The engine only ever sees validated statements.** Every figure passes the
  Financial Integrity Validator before a ratio is computed (see below).

## Financial Integrity Validator

`financial-integrity-validator.ts` — the gate between extraction and the
engine. Pure, deterministic, no I/O. It answers exactly one question:

> Can these numbers be what the auditor actually printed?

It does **not** ask whether the company is creditworthy. Negative equity, a
net loss, negative operating cash flow and collapsing revenue are all *valid*
data describing a distressed applicant — the applicant a bank most needs
assessed. Judging them belongs to the risk engine; blocking them here would
hide the very cases underwriting exists to catch. The validator therefore
rejects only what is **impossible**, never what is merely **bad**.

### Why the gate lives at the engine's door

`buildFinancialIntelligence()` has many callers (the processing pipeline, the
review desk, the analysis page, the package page, the memo builder, the
officer queue). A check placed in any one of them would leave the others
computing on impossible figures, so the validator runs inside the orchestrator
itself and drops years that fail. It returns `null` when nothing survives —
the existing no-data contract every caller already handles.

The pipeline (`case-processing-service.ts`) *also* runs it explicitly after
extraction. Not redundancy: that is the only place that knows about the run,
so it records the verdict in the audit log (`case.integrity_checked`) and
fails the case with the arithmetic reason. An officer asking "why did this
case stop?" gets the numbers, not an empty page.

### Severity

| Severity     | Meaning                                    | Effect                                   |
| ------------ | ------------------------------------------ | ---------------------------------------- |
| **BLOCKING** | The figures cannot all be from one printed statement | That **fiscal year** is withheld from the engine |
| **WARNING**  | Suspicious but possibly real               | Assessment continues, recorded for the reader |
| **INFO**     | Context the reader should know             | Assessment continues                     |

A BLOCKING finding rejects one **year**, not the case — the same "one bad part
never fails the whole case" rule the document pipeline follows. A case with one
unusable year and one good year is still underwritten on the good year. Only
when *no* year survives does the engine receive nothing and the case stop as
`PROCESSING_FAILED` at `FINANCIAL_ANALYSIS`.

### Checks

**Blocking**

- `NO_STATEMENTS` — nothing was extracted.
- `MISSING_CORE_FIGURES` — a year lacking Revenue, Net Income, Total Assets,
  Total Liabilities, Total Equity or Operating Cash Flow cannot be assessed.
- `IMPOSSIBLE_NEGATIVE` — revenue, cash, receivables, inventory, current/total
  assets, current/total liabilities or debt printed negative. (Equity, net
  income, gross/operating profit and the cash flows are legitimately negative
  and are *not* checked. COGS, finance costs and capex are printed with either
  sign by different auditors — the engine takes their magnitude — so their sign
  carries no information.)
- `BALANCE_SHEET_DOES_NOT_BALANCE` — `|assets − (liabilities + equity)|` beyond
  `INTEGRITY.balanceTolerance` of total assets. Audited statements balance; a
  break means a figure came off the wrong row. When equity exactly equals total
  assets, the message names the usual cause: the "Total equity and liabilities"
  grand total read as a component.
- `SUBTOTAL_EXCEEDS_TOTAL` — current assets > total assets, current liabilities
  > total liabilities, or cash > current assets.
- `CURRENCY_INCONSISTENT` — years in different currencies cannot be trended.
- `DUPLICATE_FISCAL_YEAR` — one period, two contradictory truths. (The DB's
  `unique(caseId, fiscalYear)` already forbids this; checked anyway because the
  validator also runs on in-memory rows.)

**Warning**

- `SCALE_INCONSISTENT` — total assets move more than `INTEGRITY.scaleJumpFactor`
  between consecutive years: one year was read in different units.
- `NET_INCOME_IMPLAUSIBLE_VS_REVENUE` — |net income| beyond
  `INTEGRITY.netIncomeToRevenueMax` × revenue.
- `RATIO_IMPLAUSIBLE` — a current ratio beyond `INTEGRITY.currentRatioMax` is a
  mis-read denominator, not a liquidity position.

**Info**

- `SINGLE_YEAR_ONLY` — point-in-time view, no trend analysis.
- `FISCAL_YEAR_GAP` — trends span non-consecutive years.
- `PARTIAL_YEARS_WITHHELD` — which years were excluded and why.

All bounds live in `thresholds.ts` under `INTEGRITY` and are deliberately
generous: wrongly rejecting a real applicant is worse than passing an
odd-looking one.

### Assessment Confidence (presentation)

`lib/finance/confidence.ts` — display only, and deliberately outside the
validator. It computes nothing and re-checks nothing; it reads the
`IntegrityReport` the validator already produced and answers the question a
Risk Officer would otherwise have to ask: *can I trust this assessment?*

| Level | When | Effect on the workspace |
| --- | --- | --- |
| 🟢 **High Confidence** | Everything validated | Recommendation shown; no report raised |
| 🟡 **Medium Confidence** | A check warned, or a year was withheld | Recommendation shown + Validation Report |
| 🔴 **Low Confidence** | Nothing survived validation | Verdict replaced by "Assessment could not be completed"; **no memo is drafted and none can be requested** |

INFO findings (single year, year gap) are context, not doubt — they never
lower confidence, though they are still listed.

The **Validation Report** (`components/analysis/validation-report.tsx`) reads
like a memo section — Summary / Confidence / Statements Affected / Issues
Found / Recommended Action — because that is how an officer will later have to
justify the decision. Each finding's plain heading comes from a code→copy map;
the validator's own message supplies the specifics (which figures, which
amounts). An unmapped code falls back to a neutral heading rather than leaking
the code, and a test asserts every code the validator can emit has a heading.

**Two audiences, two vocabularies.** A Risk Officer is a financial
professional: "assets do not equal liabilities + equity" is their language and
the numbers belong in front of them. An applicant is not being audited by this
screen — `contractorNotice()` is the only validation copy they see, it names no
figure, and it says plainly that the DOCUMENT could not be verified, never that
their company is suspect.

Where confidence appears: the officer review desk, the contractor's Financial
Intelligence page, and the printed **Underwriting Package** header (a package
is filed and re-read months later — a caveat on the figures has to travel with
it).

### Number presentation

Every figure on screen goes through `lib/format.ts`. A bare `6000000` must
never reach a user.

| Helper | Output | Use |
| --- | --- | --- |
| `formatMoney` | `SAR 6,000,000.00` | Detail views, statement figures |
| `formatMoneyWhole` | `SAR 6,000,000` | Tables, queues, findings — cents are noise |
| `formatCompactMoney` | `SAR 120M` | Chart axes |
| `formatRatio` | `2.33` | Ratios (2 dp, `—` when incomputable) |
| `formatPercent` | `11.7%` | A computed **fraction** (0.1167) |
| `formatPercentValue` | `10%` | A stored **percentage** (`"10"`, `"10.00"`) |

The last two are separate on purpose: passing a stored `10` to `formatPercent`
would report it as `1000.0%`, so the names make the mistake visible. Negatives
use accounting parentheses — `(SAR 8,000,000)`, never `-SAR 8,000,000` — via
`currencySign: "accounting"`, and `Intl` joins the code to the amount with a
non-breaking space so "SAR" can never wrap away from its number. Money is
rendered `tabular-nums` so digits align column-to-column.

**Money inputs** (`components/forms/money-field.tsx` + `lib/money-input.ts`)
group digits as the user types while the form keeps the raw decimal string:

```
what the user sees   "6,000,000"      + a SAR stamp inside the field
what the form holds  "6000000"        → zod + Prisma.Decimal, unchanged
```

Grouping shifts characters, which is what bounces a naive cursor to the end of
the field on every keystroke. The caret is therefore measured in *significant
characters* (digits and the point — separators are ignored), which regrouping
cannot move, and restored once in a layout effect before paint. Sanitizing
deliberately does NOT truncate extra decimals: the decimal-places rule is
validation's job, and swallowing "1.234" would hide the error instead of
showing it.

### Keeping historical cases honest

A stricter validator can start rejecting data an older pipeline accepted,
leaving a case with an ANALYSIS_READY badge over an empty analysis.
`scripts/reconcile-case-states.mts` finds any case whose status promises an
assessment the engine will not produce (and any run stuck RUNNING after a
crash) and reprocesses it through the real `retryProcessing` +
`runCaseProcessing` path — it never writes a status itself, so the outcome and
audit trail are whatever the pipeline decides. Read-only by default; `--apply`
to act. Decided and issued cases are never touched.

## Canonical figures & derivations

One `FinancialStatement` row per fiscal year (Sprint 2 parser). Derived only
when the figure is not printed:

| Derived | Formula |
| --- | --- |
| `grossProfit` | `revenue − cogs` |
| `totalDebt` | `shortTermDebt + longTermDebt` (present parts) |
| `debtService` | `annualDebtService`, else `interestExpense + shortTermDebt` (interest + current maturities — standard approximation) |
| `workingCapital` | `currentAssets − currentLiabilities` |
| `freeCashFlow` | `operatingCashFlow − capex` |

EBITDA is used only when printed — never estimated.

Sign convention: the parser preserves printed signs; the orchestrator
normalizes the four pure-expense magnitudes (`cogs`, `interestExpense`,
`capex`, `annualDebtService`) with `abs()`. Signs on net income, cash flows,
and equity are meaningful and untouched.

## Ratios (per fiscal year)

| Category | Ratio | Formula |
| --- | --- | --- |
| Liquidity | Current | `currentAssets / currentLiabilities` |
| | Quick | `(currentAssets − inventory) / currentLiabilities` |
| | Cash | `cash / currentLiabilities` |
| Leverage | Debt | `totalLiabilities / totalAssets` |
| | Debt-to-equity | `totalLiabilities / equity` (null when equity ≤ 0 — meaningless) |
| | Debt-to-assets | `totalDebt / totalAssets` |
| | Interest coverage | `operatingIncome / interestExpense` |
| Profitability | Gross / Operating / Net margin | each `× / revenue` |
| | ROA / ROE | `netIncome / totalAssets`, `netIncome / equity` (equity > 0) |
| | EBITDA margin | `ebitda / revenue` |
| Efficiency | Asset / Inventory / Receivable turnover | `revenue/totalAssets`, `cogs/inventory`, `revenue/receivables` |
| Cash flow | OCF ratio | `operatingCashFlow / currentLiabilities` |
| Coverage | DSCR | `ebitda / debtService` |
| | EBITDA coverage | `ebitda / interestExpense` |

Growth (YoY, adjacent years): `(current − prior) / |prior|`, null when the
prior base is non-positive (a growth % against ≤ 0 is not meaningful).

## Trends

Multi-year series (revenue, net income, cash, total debt, working capital,
equity, OCF, net margin) with YoY changes and a raw direction —
INCREASING / DECREASING / STABLE (|change| < `TREND_STABILITY_BAND` = 5%).
Whether a movement is good or bad is the flag engine's judgment, not the
trend's.

## Risk flags

Deterministic rules, each with severity, affected years, numeric evidence,
and fixed template wording. Triggers (all in `thresholds.ts`):

| Flag | Trigger | Severity |
| --- | --- | --- |
| REVENUE_DECLINE | revenue ≤ −10% / −20% YoY | MEDIUM / HIGH |
| REVENUE_SPIKE | revenue ≥ +40% YoY (overtrading watch) | LOW |
| CASH_DETERIORATION | cash ≤ −30% / −50% YoY | MEDIUM / HIGH |
| DEBT_SPIKE | debt ≥ +30% / +60% YoY (only when debt ≥ 10% of assets) | MEDIUM / HIGH |
| NEGATIVE_WORKING_CAPITAL | WC < 0 latest year | HIGH |
| NEGATIVE_OPERATING_CASH_FLOW | OCF < 0 (latest = HIGH) | MEDIUM / HIGH |
| RAPID_RECEIVABLE_GROWTH | receivable growth − revenue growth ≥ 20pp | MEDIUM |
| MARGIN_DETERIORATION | net margin −3pp / −6pp YoY | MEDIUM / HIGH |
| LIQUIDITY_CRITICAL | current ratio < 1.0 | HIGH |
| LIQUIDITY_DETERIORATION | current ratio −25% YoY | MEDIUM |
| NEGATIVE_EQUITY | equity ≤ 0 | HIGH |
| EQUITY_EROSION | equity ≤ −20% YoY | MEDIUM |
| LARGE_YOY_SWING | assets/equity/inventory move ≥ ±50% | LOW |

## Underwriting Capacity (primary KPI)

Daman's core question: **can this company financially execute THIS
contract?** 0–100, weighted sum of ten components (financial health 50 +
contract stress 50); each maps a raw value onto 0–1 by linear clamp
(`CAPACITY` in `thresholds.ts`):

| Component | Weight | 0 at | 1 at |
| --- | --- | --- | --- |
| Liquidity (current ratio) | 12 | ≤ 1.0 | ≥ 2.0 |
| Leverage (debt-to-equity) | 10 | ≥ 3.0 | ≤ 1.0 |
| Profitability (net margin) | 10 | ≤ 0 | ≥ 8% |
| Cash flow (OCF ratio) | 10 | ≤ 0 | ≥ 0.4 |
| Working capital vs mobilization (10% of contract) | 8 | 0% covered | ≥ 100% |
| Contract size vs revenue | 18 | ≥ 2.5× | ≤ 0.5× |
| Contract size vs assets | 8 | ≥ 1.5× | ≤ 0.3× |
| Guarantee vs equity | 6 | ≥ 1.0× | ≤ 0.25× |
| Contract duration | 8 | ≥ 48 mo → 0.2 (never 0) | ≤ 12 mo |
| Beneficiary type | 10 | — | GOVERNMENT 0.8 / PRIVATE 0.5 |

Missing components are excluded, weights renormalized, and the gap listed in
`missingInputs`. Non-positive equity is a real signal, not missing data —
leverage and guarantee-vs-equity score 0. Bands: ≥ 70 STRONG, ≥ 45 MODERATE,
else LIMITED.

## Risk Score (secondary KPI)

Ported from the approved V1 blueprint (`core/risk.py`). Six weighted
components across three underwriting pillars; each maps to a 0–1 **safety**
sub-score, and the published score is **(1 − weighted safety) × 100 — higher
= riskier**. Missing components are excluded + renormalized, same as
capacity. No credit bureau / banking exposure — those are Future scope.

| Component | Weight | Safety 0 at | Safety 1 at |
| --- | --- | --- | --- |
| Liquidity (current ratio) | 15 | ≤ 1.0 | ≥ 1.5 |
| Leverage (debt-to-equity) | 15 | ≥ 3.0 (or equity ≤ 0) | ≤ 1.0 |
| Profitability (net margin) | 15 | ≤ 0 | ≥ 8% |
| Debt service coverage | 20 | DSCR ≤ 1.0 | DSCR ≥ 1.5 |
| Financial trend | 15 | see below | |
| Contract exposure | 20 | see below | |

- **Coverage fallback:** when DSCR is incomputable (EBITDA not printed),
  interest coverage substitutes with its own clamp (≤ 1.0 → 0, ≥ 3.0 → 1);
  the component detail says which was used.
- **Financial trend** = `clamp01(0.7 + revenue direction (capped ±0.2) −
  flag burden)`, where the burden is 0.2 per HIGH and 0.1 per MEDIUM flag.
  A single fiscal year cannot show a trend → flat neutral 0.6. Null (excluded)
  only when two+ years exist but no YoY figure and no flag is available.
- **Contract exposure** = `clamp01(1 − guarantee-vs-equity stress −
  contract-vs-revenue stress + government bonus)`:
  guarantee stress ramps 0 → 0.6 between 0.3× and 1.0× equity (equity ≤ 0 →
  full 0.6); contract stress is 0.3 per revenue-turn above 0.5×, capped at
  0.3; government counterparty adds 0.1. Null when the contract is missing or
  neither sizing ratio is computable — **absence of data must never read as
  safety.**

Bands (lower bounds on the risk score, `RISK.bands`):

| Band | Score |
| --- | --- |
| EXCELLENT | 0–14 |
| LOW | 15–34 |
| MODERATE | 35–54 |
| HIGH | 55–74 |
| CRITICAL | 75–100 |

Worked examples (the unit tests reproduce these by hand):

- **Strong demo profile + 0.5×-revenue government contract** — all health
  components 1.0, trend 0.9 (+20% revenue, no flags), exposure 1.0 →
  safety 0.985 → **score 2, EXCELLENT**.
- **Distressed demo profile + 2.5×-revenue private contract** — every health
  component 0, trend 0 (−33% revenue, 6 HIGH + 2 MEDIUM flags), exposure
  0.42 (guarantee 0.63× equity, contract 2.5× revenue) → **score 92,
  CRITICAL**.

The dashboard presents **Underwriting Capacity as the primary KPI**; the
Risk Score is secondary. Both are displayed with their full component
breakdowns — the breakdown IS the explanation.

## Testing

`tests/finance/` — hand-computed unit tests for the ratio, trend, flag,
capacity, and risk engines, sharing `tests/fixtures/company-profiles.ts`
(the same deterministic profiles behind the sample PDFs and demo seeding).
Run with `npm test`.

`tests/finance/integrity-validator.test.ts` covers the gate from both
directions, because its two failure modes pull against each other: letting
impossible figures through (a fabricated assessment) and rejecting a
distressed-but-real applicant (hiding the case underwriting exists to catch).
The `WEAK_PROFILE` fixture — a real net loss and negative operating cash flow
— must always pass.
