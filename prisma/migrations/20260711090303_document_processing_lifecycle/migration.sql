-- AlterEnum
ALTER TYPE "DocumentProcessingStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "processing_events" JSONB;
