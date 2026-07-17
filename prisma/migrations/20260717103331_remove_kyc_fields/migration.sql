-- AlterTable
ALTER TABLE "case_qualitatives" DROP COLUMN "contractor_classification",
DROP COLUMN "cr_activities",
DROP COLUMN "equipment_plan",
DROP COLUMN "gm_experience_years",
DROP COLUMN "gm_name",
DROP COLUMN "largest_project_value";

-- DropEnum
DROP TYPE "EquipmentPlan";

