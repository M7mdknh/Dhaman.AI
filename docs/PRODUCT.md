# Daman — Product Definition

Daman is an AI-assisted corporate underwriting platform that evaluates a
company's ability to execute a specific contract by combining IFRS financial
analysis and contract characteristics — and, when available in the future,
banking exposure. It prepares a complete underwriting package for a bank Risk
Officer, **who retains the final approval authority**.

Daman does NOT replace the bank. The AI assists; the human decides.

---

## The Problem

Issuing a Letter of Guarantee (LG) today is mostly manual: Relationship
Managers collect financial statements, Risk Officers calculate ratios by hand,
and credit memos are written manually. The process takes days.

## The Solution

The contractor submits a guarantee request with contract details and audited
IFRS financial statements. Daman:

1. Parses the statements into structured figures (deterministic — no LLM)
2. Computes financial ratios and year-over-year trends (deterministic)
3. Scores risk with transparent, explainable rules (deterministic)
4. Drafts an underwriting memo (AI — explanation and prose only)

The Risk Officer receives a decision-ready package and makes the final call.
On approval, the Letter of Guarantee PDF is issued.

---

## Underwriting Pillars

1. **Company Financial Health** — from IFRS statements
2. **Contract Characteristics** — value, guarantee %, duration, beneficiary
3. **Existing Banking Exposure** — *Future (Open Banking / SIMAH)*
4. **Bank Policies**
5. **Human Review** — the Risk Officer always decides

A guarantee is never approved based on uploaded documents alone, and never by
the AI.

---

## AI Boundaries

The AI SHALL: read structured data, explain ratios and trends, explain
contract risks, draft the memo, highlight concerns and missing information.

The AI SHALL NEVER: calculate ratios, perform accounting, approve anything,
invent financial information, or ignore missing information.

---

## Roles

| Role | Purpose |
| --- | --- |
| Contractor | Creates underwriting cases, uploads statements |
| Risk Officer | Reviews packages, makes the final decision |
| Admin | User management and platform administration |

---

## Out of MVP Scope (architecture-ready, NOT implemented)

- Saudi Open Banking
- SIMAH credit bureau
- Core banking integration
- Treasury / other Wakeel agents
- Autonomous decisions
