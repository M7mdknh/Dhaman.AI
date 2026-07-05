-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CONTRACTOR', 'RISK_OFFICER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PARSING', 'ANALYSIS_READY', 'UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'DECLINED', 'ISSUED');

-- CreateEnum
CREATE TYPE "GuaranteeType" AS ENUM ('BID_BOND', 'PERFORMANCE', 'ADVANCE_PAYMENT', 'RETENTION');

-- CreateEnum
CREATE TYPE "BeneficiaryType" AS ENUM ('GOVERNMENT', 'PRIVATE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FINANCIAL_STATEMENT', 'CONTRACT', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "company_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cr_number" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "underwriting_cases" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "underwriting_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_details" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "beneficiary_type" "BeneficiaryType" NOT NULL,
    "contract_title" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "project_location" TEXT NOT NULL,
    "contract_value" DECIMAL(18,2) NOT NULL,
    "guarantee_amount" DECIMAL(18,2) NOT NULL,
    "guarantee_type" "GuaranteeType" NOT NULL,
    "duration_months" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "doc_type" "DocumentType" NOT NULL DEFAULT 'FINANCIAL_STATEMENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_statements" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "document_id" TEXT,
    "fiscal_year" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "audited" BOOLEAN NOT NULL DEFAULT true,
    "revenue" DECIMAL(18,2),
    "cogs" DECIMAL(18,2),
    "operating_income" DECIMAL(18,2),
    "net_income" DECIMAL(18,2),
    "ebitda" DECIMAL(18,2),
    "interest_expense" DECIMAL(18,2),
    "cash" DECIMAL(18,2),
    "receivables" DECIMAL(18,2),
    "inventory" DECIMAL(18,2),
    "current_assets" DECIMAL(18,2),
    "total_assets" DECIMAL(18,2),
    "current_liabilities" DECIMAL(18,2),
    "total_liabilities" DECIMAL(18,2),
    "total_debt" DECIMAL(18,2),
    "total_equity" DECIMAL(18,2),
    "operating_cash_flow" DECIMAL(18,2),
    "capex" DECIMAL(18,2),
    "annual_debt_service" DECIMAL(18,2),
    "source_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cr_number_key" ON "companies"("cr_number");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "underwriting_cases_seq_key" ON "underwriting_cases"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "underwriting_cases_reference_key" ON "underwriting_cases"("reference");

-- CreateIndex
CREATE INDEX "underwriting_cases_status_idx" ON "underwriting_cases"("status");

-- CreateIndex
CREATE INDEX "underwriting_cases_created_by_id_idx" ON "underwriting_cases"("created_by_id");

-- CreateIndex
CREATE INDEX "underwriting_cases_created_at_idx" ON "underwriting_cases"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contract_details_case_id_key" ON "contract_details"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_case_id_idx" ON "documents"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_statements_case_id_fiscal_year_key" ON "financial_statements"("case_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "audit_logs_case_id_idx" ON "audit_logs"("case_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwriting_cases" ADD CONSTRAINT "underwriting_cases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwriting_cases" ADD CONSTRAINT "underwriting_cases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_details" ADD CONSTRAINT "contract_details_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "underwriting_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

