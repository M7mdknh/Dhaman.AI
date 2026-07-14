-- AlterEnum
ALTER TYPE "CaseStatus" ADD VALUE 'RM_REVIEWED';

-- AlterEnum
ALTER TYPE "GuaranteeType" ADD VALUE 'LETTER_OF_CREDIT';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'RELATIONSHIP_MANAGER';

-- AlterTable
ALTER TABLE "underwriting_cases" ADD COLUMN     "rm_reviewer_id" TEXT,
ADD COLUMN     "rm_submitted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "memo_revisions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "decision_intelligence_id" TEXT,
    "author_id" TEXT,
    "version" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "relationship_context" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memo_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memo_revisions_case_id_created_at_idx" ON "memo_revisions"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "memo_revisions_case_id_version_key" ON "memo_revisions"("case_id", "version");

-- AddForeignKey
ALTER TABLE "underwriting_cases" ADD CONSTRAINT "underwriting_cases_rm_reviewer_id_fkey" FOREIGN KEY ("rm_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_revisions" ADD CONSTRAINT "memo_revisions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_revisions" ADD CONSTRAINT "memo_revisions_decision_intelligence_id_fkey" FOREIGN KEY ("decision_intelligence_id") REFERENCES "decision_intelligence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_revisions" ADD CONSTRAINT "memo_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
