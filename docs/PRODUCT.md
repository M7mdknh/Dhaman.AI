# Daman — Product Definition

Daman is an **AI-powered corporate underwriting platform** that evaluates a
company's ability to execute a specific contract by combining IFRS financial
analysis and contract characteristics — and, when available in the future,
banking exposure. It prepares a complete underwriting package for a bank Risk
Officer, **who retains the final approval authority**.

Document extraction is only one component. The product optimizes for
delivering underwriting value *quickly* — during the MVP, speed and user
experience take priority over perfect financial statement reconstruction.

Daman does NOT replace the bank. The AI assists; the human decides.

---

## The Problem

Issuing a Letter of Guarantee (LG) today is mostly manual: Relationship
Managers collect financial statements, Risk Officers calculate ratios by hand,
and credit memos are written manually. The process takes days.

## The Solution

The contractor submits a guarantee request with contract details and audited
IFRS financial statements (latest year required; previous years optional).
Daman:

1. Extracts the statements into structured figures — text-layer first, then
   GPT-Vision for scanned/damaged documents (AI reads the document; it never
   calculates), with OCR as a last-resort fallback
2. Computes financial ratios and year-over-year trends (deterministic)
3. Scores risk with transparent, explainable rules (deterministic)
4. Drafts an underwriting memo (AI — explanation and prose only)

Steps 2–3 are the deterministic Financial Intelligence Engine, which surfaces
the underwriting headline (Capacity, Rating, Financial Health, Risk Level,
Recommendation) in seconds. The AI memo (step 4) runs in the background and
never blocks the assessment.

The Risk Officer receives a decision-ready package and makes the final call.
On approval, the Letter of Guarantee PDF is issued.

---

## Underwriting modes

Two business workflows share the same deterministic engines — only document
scope and AI-memo timing change (`UNDERWRITING_MODE`).

| Mode | Purpose | Statements read | AI memo |
| --- | --- | --- | --- |
| **⚡ Express** (default) | Meaningful assessment in ~5s | Latest only (comparative column still trends ≥2 years) | Lazy — on first officer open |
| **📊 Comprehensive** | Production-grade, full history | All uploaded fiscal years | Eager — background |

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

The AI has exactly two jobs: **document understanding** (vision extraction of
scanned/damaged statement pages into structured figures, which are then flagged
for officer verification) and **underwriting explanation** (draft the memo,
explain ratios/trends/contract risks, highlight concerns and missing
information).

The AI SHALL NEVER: calculate ratios, perform accounting, produce a financial
figure through reasoning, approve anything, invent financial information, or
ignore missing information. Every figure that reaches underwriting comes from
the deterministic engine over extracted values, never from the model's math.

---

## Roles

| Role | Purpose |
| --- | --- |
| Contractor | Creates underwriting cases, uploads statements |
| Risk Officer | Reviews packages, makes the final decision |
| Admin | User management and platform administration |

---

## Out of MVP Scope (architecture-ready, NOT implemented)

- Deep Extraction (production-grade document AI for scanned Arabic statements)
- Saudi Open Banking
- SIMAH credit bureau
- Core banking integration
- Treasury / other Wakeel agents
- Autonomous decisions
