-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('APPROVE', 'APPROVE_WITH_CONDITIONS', 'MANUAL_REVIEW', 'REJECT');

-- CreateTable
CREATE TABLE "decision_intelligence" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "input_snapshot" JSONB NOT NULL,
    "input_hash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "summary" TEXT NOT NULL,
    "company_strengths" TEXT[],
    "company_weaknesses" TEXT[],
    "contract_assessment" TEXT NOT NULL,
    "risk_explanation" TEXT NOT NULL,
    "recommendation_reason" TEXT NOT NULL,
    "missing_information" TEXT[],
    "confidence_explanation" TEXT NOT NULL,
    "next_steps" TEXT[],
    "recommendation" "RecommendationType" NOT NULL,
    "ai_recommendation" "RecommendationType" NOT NULL,
    "ai_diverged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decision_intelligence_case_id_created_at_idx" ON "decision_intelligence"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "decision_intelligence_case_id_input_hash_idx" ON "decision_intelligence"("case_id", "input_hash");

-- AddForeignKey
ALTER TABLE "decision_intelligence" ADD CONSTRAINT "decision_intelligence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_intelligence" ADD CONSTRAINT "decision_intelligence_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

