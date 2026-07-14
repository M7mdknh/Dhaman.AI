# TODO.md

# Daman Roadmap

## AI-Powered Corporate Underwriting Platform

---

# Project Status

Current Stage

🟢 MVP Feature Complete

Current Focus

Enterprise Polish

Hackathon Readiness

Current Goal

Deliver the most convincing AI-powered Corporate Underwriting experience possible.

No new major features should be introduced unless they dramatically improve the demonstration.

---

# Guiding Principle

The objective is NOT

building more features.

The objective IS

building the best Corporate Underwriting experience.

Whenever there is a conflict

Feature

vs

Better UX

Always choose UX.

---

# MVP Scope

## Contractor

- [x] Authentication
- [x] Dashboard
- [x] Create Underwriting Case
- [x] Contract Details
- [x] Financial Statement Upload
- [x] Processing Dashboard
- [x] Financial Intelligence
- [x] Case Timeline
- [x] Document Status
- [x] Retry Failed Documents

---

## Financial Intelligence

- [x] Financial Ratios
- [x] Financial Health
- [x] Underwriting Capacity
- [x] Risk Score
- [x] Company Rating
- [x] Trend Analysis
- [x] Risk Flags

---

## Decision Intelligence

- [x] Executive Summary
- [x] AI Memo
- [x] Recommendation Explanation
- [x] Lazy AI Generation

---

## Relationship Manager

- [x] Dashboard (shared review queue)
- [x] Case Review (read access)
- [x] Memo Refinement (version-tracked revisions)
- [x] Relationship Context
- [x] Submit to Risk Officer

---

## Risk Officer

- [x] Dashboard
- [x] Queue
- [x] Case Review
- [x] RM Assessment Panel
- [x] Financial Intelligence
- [x] Decision Intelligence
- [x] Recommendation
- [x] Decision

---

## Administrator

- [x] Monitoring
- [x] Audit Trail
- [x] Operational Dashboard

---

# Current Priorities

## Priority 1

Demo Quality

Everything should feel

- Fast
- Professional
- Banking Grade

---

## Priority 2

UI Polish

Checklist

- [ ] Perfect spacing
- [ ] Perfect alignment
- [x] No overflowing text (verified at 1440px, all roles, 2026-07-14)
- [x] No clipped layouts (ratio-table clipping fixed 2026-07-14)
- [ ] Consistent typography
- [ ] Responsive layouts
- [ ] Consistent card heights
- [ ] Better loading states
- [ ] Better empty states
- [ ] Better error states
- [ ] Better transitions
- [ ] Better animations

---

## Priority 3

Financial Dashboard

- [ ] Better KPI hierarchy
- [ ] Larger executive metrics
- [ ] Cleaner charts
- [ ] Better recommendation section
- [ ] Better risk visualization
- [ ] Better financial driver presentation
- [ ] Better company rating presentation

---

## Priority 4

Demo Experience

- [ ] Demo data polished
- [ ] Demo workflow rehearsed
- [ ] Strong company
- [ ] Medium company
- [ ] Weak company
- [ ] Officer queue tells a story
- [ ] Landing page polished
- [ ] No waiting confusion
- [ ] No unclear wording

---

# Express Underwriting

Status

Default

Purpose

Fast underwriting assessment.

Requirements

- Latest audited financial statement

Produces

- Financial Health
- Risk Score
- Company Rating
- Underwriting Capacity
- Recommendation

Target

< 5 seconds

---

# Comprehensive Underwriting

Status

Future

Purpose

Complete production underwriting.

Includes

- Multi-year analysis
- Historical trends
- Open Banking
- SIMAH
- Etimad
- Full Financial Intelligence

Target

< 20 seconds

---

# Future Integrations

## Open Banking

Status

Planned

Purpose

Real-time

- Cash
- Balances
- Transactions

Source

SAMA Open Banking

---

## SIMAH

Status

Planned

Purpose

Credit Exposure

Existing Facilities

Outstanding Debt

Repayment Behaviour

---

## Etimad

Status

Planned

Purpose

Government Contract Verification

---

## Core Banking

Status

Planned

Purpose

Automatic Letter of Guarantee Issuance

---

# Technical Debt

High

- [ ] CSP
- [ ] Error Monitoring
- [ ] CI Pipeline
- [ ] JWT Revocation
- [ ] Malware Scanning

Medium

- [ ] Better Admin Tools
- [ ] Better Officer Filters
- [ ] Better Search
- [ ] Better Notifications

Low

- [ ] Dark Mode
- [ ] Accessibility Improvements
- [ ] Keyboard Shortcuts

---

# Never Build

Do NOT build

- Random AI features
- Chatbot
- Generic OCR tools
- Accounting software
- ERP functionality

Everything must improve underwriting.

---

# Before Demo

Checklist (verified 2026-07-14)

- [x] Build passes
- [x] TypeScript passes
- [x] Lint passes
- [x] No console errors (Playwright walkthrough, all roles)
- [x] OpenAI verified (gpt-4o-mini + gpt-4.1 live, quota OK)
- [x] Neon verified (health endpoint + full pipeline runs)
- [x] Cloudflare R2 verified (uploads read back through the pipeline)
- [x] Demo data seeded (fresh reset — junk test cases removed)
- [x] Demo accounts verified (all three logins walked)
- [x] Strong case verified (Rawabi — 95 capacity / risk 2 / APPROVE)
- [x] Medium case verified (Nimah — 68 / 19 / APPROVE WITH CONDITIONS)
- [x] Weak case verified (Faisal — 13 / 92 / REJECT, High priority)
- [x] AI memo verified (all three generated live, prompt v3, consistent names —
      still valid; regenerations now use prompt v4 with the product analysis focus)
- [x] RM flow verified live (rm@daman.local: refine memo → submit to Risk
      Officer → officer sees RM Assessment + starts review; 2026-07-14)
- [x] Letter of Credit verified live (wizard option + focus hint, full
      pipeline run to ANALYSIS_READY, officer review; 2026-07-14)
- [ ] Officer decision → LG issuance rehearsal (deliberately NOT run on the
      seeded cases — deciding them would empty the pending queue before the
      demo; the flow was E2E-verified in Sprint 5 and is unchanged)
- [ ] Full on-stage rehearsal by the presenter

---

# Demo Accounts

Administrator

Nawaf Alharthi

Role

System Administrator

---

Contractor

Abdulrahman Yaghmour

Company

Rawabi Contracting Co.

---

Relationship Manager

Salman Alghamdi

Organization

Alinma Bank

---

Risk Officer

Omar Alkaltham

Organization

Alinma Bank

---

# Success Criteria

The project is successful when

A contractor uploads real financial statements.

↓

Within a few seconds

↓

Receives

- Financial Health
- Company Rating
- Underwriting Capacity
- Risk Score

↓

A Risk Officer receives

- Financial Intelligence
- Decision Intelligence
- Recommendation

↓

The entire experience feels like enterprise banking software.

---

# North Star

We are NOT building

an OCR platform.

We are NOT building

a chatbot.

We ARE building

the best AI-powered Corporate Underwriting Platform.