# CLAUDE.md

# Dhaman

## AI-Powered Corporate Underwriting Platform

---

# Mission

Dhaman is an AI-powered Corporate Underwriting Platform that assists banks in issuing Letters of Guarantee faster, more consistently and more transparently.

The platform is NOT an OCR product.

The platform is NOT a chatbot.

The platform is NOT an accounting application.

The platform exists to help banks make better underwriting decisions.

---

# Product Philosophy

Every engineering decision must answer one question:

> Does this improve underwriting?

If the answer is no,

do not build it.

---

# Core Value Proposition

Upload

↓

Financial Intelligence

↓

Decision Intelligence

↓

Professional Underwriting Package

↓

Risk Officer Decision

---

# Current MVP

The MVP focuses on

- Contract Details
- Audited Financial Statements
- Financial Intelligence
- Decision Intelligence
- Risk Officer Workflow
- Letter of Guarantee

The MVP intentionally DOES NOT include

- SAMA Open Banking
- SIMAH
- Core Banking
- Treasury
- ERP

Those are future integrations.

---

# Product Philosophy

There are two underwriting experiences.

## ⚡ Express Underwriting

Default experience.

Purpose

Generate a believable underwriting assessment within approximately 5 seconds.

Characteristics

- Latest audited financial statement required.
- Previous years optional.
- Fast extraction.
- Deterministic Financial Intelligence.
- AI memo generated lazily.
- Optimized for demonstrations and operational efficiency.

---

## 📊 Comprehensive Underwriting

Future production workflow.

Purpose

Provide complete commercial underwriting.

Characteristics

- Multi-year analysis.
- Historical trends.
- Complete deterministic extraction.
- Open Banking.
- SIMAH.
- Full underwriting package.

---

# Architecture

```
Contractor

↓

Contract Details

↓

Audited Financial Statements

↓

Financial Intelligence Engine

↓

Decision Intelligence Engine

↓

Relationship Manager

↓

Risk Officer

↓

Letter of Guarantee
```

Future

```
Financial Statements

+

Open Banking

+

SIMAH

+

Etimad

↓

Financial Intelligence Engine
```

The engine must never depend on a single data source.

New integrations become inputs,

not architectural rewrites.

---

# Financial Intelligence Engine

The Financial Intelligence Engine is the heart of Dhaman.

It is ALWAYS deterministic.

Responsibilities

- Financial Ratios
- Trend Analysis
- Financial Health
- Underwriting Capacity
- Risk Score
- Company Rating
- Risk Flags

Never allow AI to calculate

- Ratios
- Scores
- Recommendations

---

# Decision Intelligence Engine

AI responsibilities

- Executive Summary
- Credit Memorandum
- Recommendation Explanation
- Risk Explanation
- Narrative Generation

AI explains.

AI never decides.

---

# AI Rules

AI may

✓ Read documents

✓ Extract structured information

✓ Explain deterministic outputs

✓ Produce executive summaries

AI must NEVER

✗ Calculate ratios

✗ Calculate risk score

✗ Calculate underwriting capacity

✗ Approve

✗ Reject

✗ Override deterministic calculations

---

# Banking Philosophy

Every decision must remain explainable.

Every score must have evidence.

Every recommendation must be reproducible.

Every approval must belong to a human.

---

# User Roles

Contractor

- Creates underwriting requests
- Uploads financial statements
- Tracks progress

Relationship Manager

- Reviews the AI-drafted memo
- Refines it (version-tracked revisions — the AI original is never mutated)
- Adds relationship context
- Routes the package to the Risk Officer
- Never decides

Risk Officer

- Reviews underwriting package
- Reviews Financial Intelligence
- Reviews the RM assessment
- Reviews AI memorandum
- Makes final decision
- May start directly from Analysis Ready — the RM stage never blocks

Administrator

- Monitors platform
- Manages operations
- Reviews audit logs

---

# UI Philosophy

The application should feel like

- Stripe
- Mercury
- Ramp
- Bloomberg Terminal

Never

Bootstrap Admin

Never

Student Project

Never

Hackathon UI

The interface should feel like enterprise banking software.

---

# UX Philosophy

Users should never wonder

"What is happening?"

Every page must answer

- What happened?
- What is risky?
- What should I do next?

---

# Demo Philosophy

The objective is NOT

perfect document parsing.

The objective is

demonstrating believable AI-powered underwriting.

Judges should understand the value of Dhaman within the first minute.

---

# Performance Targets

Express Underwriting

Submission

< 2 seconds

Financial Intelligence

< 5 seconds

Decision Intelligence

Background

Comprehensive Underwriting

< 20 seconds

---

# Error Philosophy

Never expose technical errors.

Never blame the user.

Never say

"Unknown Error"

Instead

Explain

- what happened
- why
- what to do next

---

# Document Processing

Each uploaded document is independent.

Lifecycle

Queued

↓

Processing

↓

Extracted

or

Failed

↓

Retry

One failed document must never block the entire case.

---

# Retry Philosophy

Retry means

Resume.

Never

Restart.

Completed work is never repeated.

---

# Security

Always

- Role Based Access
- Server-side authorization
- Input validation
- Zod
- Prisma
- Parameterized queries

Never trust client input.

---

# Database

Neon PostgreSQL

Prisma ORM

Cloudflare R2

OpenAI

Next.js Server Actions

TypeScript

These technologies are fixed unless there is a compelling architectural reason.

---

# Code Philosophy

Readable code is better than clever code.

Prefer

Simple

Deterministic

Maintainable

Well documented

Never optimize prematurely.

---

# Documentation

Every major feature must update

README

PROJECT_STATUS

TODO

TECH_DEBT

Architecture documentation

No documentation drift.

---

# Demo Data

Administrator

Nawaf Alharthi

System Administrator

Contractor

Abdulrahman Yaghmour

Rawabi Contracting Co.

Relationship Manager

Salman Alghamdi

Alinma Bank

Risk Officer

Omar Alkaltham

Alinma Bank

All seeded data should reinforce the demo story.

---

# Definition of Done

A task is complete only if

✓ Build passes

✓ TypeScript passes

✓ Lint passes

✓ Tested manually

✓ UI reviewed

✓ Mobile reviewed

✓ Desktop reviewed

✓ Documentation updated

✓ No obvious UX issues

---

# Before Every Commit

Ask

Does this improve

- underwriting?
- UX?
- demo quality?
- banking credibility?

If not,

do not commit it.

---

# Never Do

Never rewrite working architecture without a compelling reason.

Never replace deterministic logic with AI.

Never block submission waiting for AI.

Never introduce features that reduce demo quality.

Never optimize OCR at the expense of underwriting.

Never build features that judges will never see.

---

# North Star

Dhaman exists to help banks issue better guarantees faster.

Everything else is secondary.