-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "processing_status" "DocumentProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
ADD COLUMN     "sha256" TEXT;

-- AlterTable
ALTER TABLE "financial_statements" ADD COLUMN     "financing_cash_flow" DECIMAL(18,2),
ADD COLUMN     "gross_profit" DECIMAL(18,2),
ADD COLUMN     "investing_cash_flow" DECIMAL(18,2),
ADD COLUMN     "long_term_debt" DECIMAL(18,2),
ADD COLUMN     "short_term_debt" DECIMAL(18,2),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "document_extractions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "parser_name" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "currency" TEXT,
    "scale" INTEGER NOT NULL DEFAULT 1,
    "fiscal_years" INTEGER[],
    "detected_statements" TEXT[],
    "company_name" TEXT,
    "raw" JSONB,
    "validation" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_extractions_document_id_key" ON "document_extractions"("document_id");

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

