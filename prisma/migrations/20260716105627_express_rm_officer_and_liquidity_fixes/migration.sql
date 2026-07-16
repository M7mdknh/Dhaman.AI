/*
  Warnings:

  - Made the column `expected_payment_terms` on table `contract_details` required. This step will fail if there are existing NULL values in that column.
  - Made the column `guarantee_percentage` on table `contract_details` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill existing rows before tightening the columns to NOT NULL.
-- guarantee_percentage: derive from the two figures that already exist
-- (guarantee_amount / contract_value), keeping the pre-existing amount
-- consistent with the new invariant (amount = value * ratio / 100) rather
-- than overwriting it with an arbitrary constant.
UPDATE "contract_details"
SET "guarantee_percentage" = ROUND((guarantee_amount / NULLIF(contract_value, 0)) * 100, 2)
WHERE "guarantee_percentage" IS NULL;
-- Rare fallback: contract_value was 0, so the ratio above is still null.
UPDATE "contract_details" SET "guarantee_percentage" = 100 WHERE "guarantee_percentage" IS NULL;
UPDATE "contract_details" SET "expected_payment_terms" = 'Not specified' WHERE "expected_payment_terms" IS NULL;

-- AlterTable
ALTER TABLE "contract_details" ALTER COLUMN "expected_payment_terms" SET NOT NULL,
ALTER COLUMN "guarantee_percentage" SET NOT NULL;

-- AlterTable
ALTER TABLE "financial_statements" ADD COLUMN     "depreciation_amortization" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "rm_suggested_decisions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "rm_id" TEXT NOT NULL,
    "decision" "OfficerDecisionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "conditions" TEXT,
    "decision_intelligence_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rm_suggested_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rm_suggested_decisions_case_id_created_at_idx" ON "rm_suggested_decisions"("case_id", "created_at");

-- AddForeignKey
ALTER TABLE "rm_suggested_decisions" ADD CONSTRAINT "rm_suggested_decisions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rm_suggested_decisions" ADD CONSTRAINT "rm_suggested_decisions_rm_id_fkey" FOREIGN KEY ("rm_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rm_suggested_decisions" ADD CONSTRAINT "rm_suggested_decisions_decision_intelligence_id_fkey" FOREIGN KEY ("decision_intelligence_id") REFERENCES "decision_intelligence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
