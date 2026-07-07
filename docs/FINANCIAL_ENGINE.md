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
