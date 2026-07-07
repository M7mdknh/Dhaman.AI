-- CreateEnum
CREATE TYPE "OfficerDecisionType" AS ENUM ('APPROVE', 'APPROVE_WITH_CONDITIONS', 'REJECT', 'REQUEST_INFO');

-- AlterTable
ALTER TABLE "underwriting_cases" ADD COLUMN     "assigned_officer_id" TEXT,
ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "review_started_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "officer_decisions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "officer_id" TEXT NOT NULL,
    "decision" "OfficerDecisionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "conditions" TEXT,
    "decision_intelligence_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "officer_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_notes" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "author_id" TEXT,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantees" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "issued_by_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "beneficiary" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guarantees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "officer_decisions_case_id_created_at_idx" ON "officer_decisions"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "case_notes_case_id_created_at_idx" ON "case_notes"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "guarantees_seq_key" ON "guarantees"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "guarantees_reference_key" ON "guarantees"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "guarantees_case_id_key" ON "guarantees"("case_id");

-- CreateIndex
CREATE INDEX "underwriting_cases_assigned_officer_id_idx" ON "underwriting_cases"("assigned_officer_id");

-- AddForeignKey
ALTER TABLE "underwriting_cases" ADD CONSTRAINT "underwriting_cases_assigned_officer_id_fkey" FOREIGN KEY ("assigned_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officer_decisions" ADD CONSTRAINT "officer_decisions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officer_decisions" ADD CONSTRAINT "officer_decisions_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officer_decisions" ADD CONSTRAINT "officer_decisions_decision_intelligence_id_fkey" FOREIGN KEY ("decision_intelligence_id") REFERENCES "decision_intelligence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantees" ADD CONSTRAINT "guarantees_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantees" ADD CONSTRAINT "guarantees_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

