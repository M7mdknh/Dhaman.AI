-- CreateEnum
CREATE TYPE "StatementType" AS ENUM ('AUDITED', 'REVIEWED', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "NitaqatBand" AS ENUM ('PLATINUM', 'GREEN', 'YELLOW', 'RED');

-- CreateEnum
CREATE TYPE "ProjectsCompletedBand" AS ENUM ('UNDER_5', 'FROM_5_TO_10', 'FROM_10_TO_25', 'OVER_25');

-- CreateEnum
CREATE TYPE "EquipmentPlan" AS ENUM ('OWNED', 'RENT', 'PURCHASE');

-- CreateEnum
CREATE TYPE "AuditorTier" AS ENUM ('BIG_FOUR', 'ACCREDITED_LOCAL', 'OTHER_FIRM', 'UNAUDITED');

-- CreateEnum
CREATE TYPE "FundingSource" AS ENUM ('OWN_CASH', 'THIS_BANK', 'OTHER_BANK', 'SUPPLIER_CREDIT');

-- CreateEnum
CREATE TYPE "ContractorRole" AS ENUM ('MAIN_CONTRACTOR', 'SUBCONTRACTOR');

-- CreateEnum
CREATE TYPE "AwardMethod" AS ENUM ('PUBLIC_TENDER', 'LIMITED_TENDER', 'DIRECT_AWARD');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'MILESTONE', 'OTHER');

-- AlterTable
ALTER TABLE "contract_details" ADD COLUMN     "advance_payment_pct" DECIMAL(5,2),
ADD COLUMN     "award_method" "AwardMethod",
ADD COLUMN     "back_to_back_payment" BOOLEAN,
ADD COLUMN     "billing_cycle" "BillingCycle",
ADD COLUMN     "bond_validity_date" DATE,
ADD COLUMN     "contractor_role" "ContractorRole",
ADD COLUMN     "expected_gross_margin_pct" DECIMAL(5,2),
ADD COLUMN     "extend_or_pay" BOOLEAN,
ADD COLUMN     "key_suppliers_identified" BOOLEAN,
ADD COLUMN     "key_suppliers_note" TEXT,
ADD COLUMN     "ld_cap_pct" DECIMAL(5,2),
ADD COLUMN     "ld_rate_pct_per_week" DECIMAL(5,2),
ADD COLUMN     "main_contractor_name" TEXT,
ADD COLUMN     "mobilization_weeks" INTEGER,
ADD COLUMN     "on_first_demand" BOOLEAN,
ADD COLUMN     "payment_notes" TEXT,
ADD COLUMN     "payment_period_days" INTEGER,
ADD COLUMN     "prior_contracts_with_beneficiary" INTEGER,
ADD COLUMN     "required_bond_pct" DECIMAL(5,2),
ADD COLUMN     "retention_pct" DECIMAL(5,2),
ALTER COLUMN "expected_payment_terms" DROP NOT NULL;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "statement_type" "StatementType";

-- AlterTable
ALTER TABLE "financial_statements" ADD COLUMN     "statement_type" "StatementType" NOT NULL DEFAULT 'AUDITED';

-- CreateTable
CREATE TABLE "case_qualitatives" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "cr_issue_date" DATE NOT NULL,
    "cr_activities" TEXT NOT NULL,
    "contractor_classification" TEXT,
    "part_of_group" BOOLEAN NOT NULL,
    "group_name" TEXT,
    "gm_name" TEXT NOT NULL,
    "gm_experience_years" INTEGER NOT NULL,
    "ownership_changed" BOOLEAN NOT NULL,
    "ownership_change_note" TEXT,
    "nitaqat_band" "NitaqatBand" NOT NULL,
    "ongoing_litigation" BOOLEAN NOT NULL,
    "litigation_note" TEXT,
    "projects_completed_band" "ProjectsCompletedBand" NOT NULL,
    "largest_project_value" DECIMAL(18,2) NOT NULL,
    "had_project_issues" BOOLEAN NOT NULL,
    "project_issues_note" TEXT,
    "guarantee_called" BOOLEAN NOT NULL,
    "guarantee_called_note" TEXT,
    "same_type_experience" BOOLEAN NOT NULL,
    "same_type_experience_note" TEXT,
    "running_projects_count" INTEGER NOT NULL,
    "backlog_value" DECIMAL(18,2) NOT NULL,
    "outstanding_guarantees" DECIMAL(18,2) NOT NULL,
    "equipment_plan" "EquipmentPlan" NOT NULL,
    "heavy_hiring_needed" BOOLEAN NOT NULL,
    "main_bank" TEXT NOT NULL,
    "conduct_incidents" BOOLEAN NOT NULL,
    "conduct_incidents_note" TEXT,
    "auditor_tier" "AuditorTier" NOT NULL,
    "auditor_name" TEXT,
    "funding_source" "FundingSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_qualitatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_qualitatives_case_id_key" ON "case_qualitatives"("case_id");

-- AddForeignKey
ALTER TABLE "case_qualitatives" ADD CONSTRAINT "case_qualitatives_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
