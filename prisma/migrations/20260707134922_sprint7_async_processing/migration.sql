-- CreateEnum
CREATE TYPE "ProcessingStage" AS ENUM ('READING_STATEMENTS', 'DETECTING_STATEMENTS', 'EXTRACTING_DATA', 'FINANCIAL_ANALYSIS', 'AI_UNDERWRITING');

-- CreateEnum
CREATE TYPE "ProcessingState" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "CaseStatus" ADD VALUE 'PROCESSING_FAILED';

-- CreateTable
CREATE TABLE "case_processing" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "state" "ProcessingState" NOT NULL DEFAULT 'QUEUED',
    "stage" "ProcessingStage",
    "failed_stage" "ProcessingStage",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_processing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_processing_case_id_key" ON "case_processing"("case_id");

-- CreateIndex
CREATE INDEX "case_processing_state_idx" ON "case_processing"("state");

-- AddForeignKey
ALTER TABLE "case_processing" ADD CONSTRAINT "case_processing_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
