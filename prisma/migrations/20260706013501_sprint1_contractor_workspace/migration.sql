-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_person" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "contract_details" DROP COLUMN "duration_months",
ADD COLUMN     "additional_notes" TEXT,
ADD COLUMN     "contract_description" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "expected_payment_terms" TEXT,
ADD COLUMN     "guarantee_percentage" DECIMAL(5,2),
ADD COLUMN     "project_end_date" DATE NOT NULL,
ADD COLUMN     "project_start_date" DATE NOT NULL;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "fiscal_year" INTEGER;

