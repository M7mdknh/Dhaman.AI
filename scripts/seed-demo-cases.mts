/**
 * DEV TOOL: builds three demo underwriting cases (strong / moderate / weak)
 * through the REAL service layer — draft → contract details → generated
 * statement PDFs → submit → IFRS extraction pipeline. Doubles as an
 * end-to-end verification of the whole Sprint 2 flow.
 *
 * Destructive for the demo contractor: existing cases are removed first.
 *
 *   npx tsx scripts/seed-demo-cases.ts
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { addFinancialStatement } from "@/services/document-service";
import { createDraftCase, saveContractDetails, submitCase } from "@/services/case-service";

import { ALL_PROFILES, type CompanyProfile } from "../tests/fixtures/company-profiles";
import { textPagesToPdf } from "../tests/fixtures/pdf-writer";
import {
  cashFlowsPage,
  financialPositionPage,
  profitOrLossPage,
} from "../tests/fixtures/statement-text";

import type { ContractDetailsInput } from "@/lib/validation/case";

const CONTRACTS: Record<keyof typeof ALL_PROFILES, ContractDetailsInput> = {
  strong: {
    beneficiary: "Ministry of Municipal and Rural Affairs",
    beneficiaryType: "GOVERNMENT",
    contractTitle: "Riyadh North District Roads Package 3",
    contractDescription: "Road works and utilities for the northern district expansion.",
    sector: "Infrastructure",
    contractValue: "60000000",
    currency: "SAR",
    guaranteeAmount: "6000000",
    guaranteeType: "PERFORMANCE",
    guaranteePercentage: "10",
    projectStartDate: "2026-09-01",
    projectEndDate: "2028-08-31",
    projectLocation: "Riyadh",
    expectedPaymentTerms: "Monthly progress certificates, 60 days",
    additionalNotes: "",
  },
  moderate: {
    beneficiary: "Jeddah Urban Development Co.",
    beneficiaryType: "PRIVATE",
    contractTitle: "Corniche Mixed-Use Development — Enabling Works",
    contractDescription: "",
    sector: "General Construction",
    contractValue: "60000000",
    currency: "SAR",
    guaranteeAmount: "6000000",
    guaranteeType: "PERFORMANCE",
    guaranteePercentage: "10",
    projectStartDate: "2026-09-01",
    projectEndDate: "2028-02-29",
    projectLocation: "Jeddah",
    expectedPaymentTerms: "",
    additionalNotes: "",
  },
  weak: {
    beneficiary: "Eastern Province Industrial Services",
    beneficiaryType: "PRIVATE",
    contractTitle: "Dammam Warehouse Complex Construction",
    contractDescription: "",
    sector: "General Construction",
    contractValue: "75000000",
    currency: "SAR",
    guaranteeAmount: "7500000",
    guaranteeType: "PERFORMANCE",
    guaranteePercentage: "10",
    projectStartDate: "2026-09-01",
    projectEndDate: "2029-08-31",
    projectLocation: "Dammam",
    expectedPaymentTerms: "",
    additionalNotes: "",
  },
};

function profilePdf(profile: CompanyProfile): Buffer {
  return textPagesToPdf([
    financialPositionPage(profile),
    profitOrLossPage(profile),
    cashFlowsPage(profile),
  ]);
}

async function main() {
  const contractor = await prisma.user.findUniqueOrThrow({
    where: { email: "contractor@daman.local" },
  });

  const removed = await prisma.underwritingCase.deleteMany({
    where: { companyId: contractor.companyId! },
  });
  if (removed.count) console.log(`Removed ${removed.count} previous demo case(s).`);

  for (const [key, profile] of Object.entries(ALL_PROFILES)) {
    const draft = await createDraftCase(contractor.id);
    if (!draft.ok) throw new Error(`createDraftCase(${key}): ${draft.error}`);
    const { caseId, reference } = draft.data;

    const details = await saveContractDetails(contractor.id, caseId, CONTRACTS[key as keyof typeof CONTRACTS]);
    if (!details.ok) throw new Error(`saveContractDetails(${key}): ${details.error}`);

    const pdf = profilePdf(profile);
    const file = new File([new Uint8Array(pdf)], `${key}-statements-2025.pdf`, {
      type: "application/pdf",
    });
    const upload = await addFinancialStatement(contractor.id, caseId, file, 2025);
    if (!upload.ok) throw new Error(`addFinancialStatement(${key}): ${upload.error}`);

    const submitted = await submitCase(contractor.id, caseId);
    if (!submitted.ok) throw new Error(`submitCase(${key}): ${submitted.error}`);

    const result = await prisma.underwritingCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { financialStatements: { orderBy: { fiscalYear: "desc" } } },
    });
    console.log(
      `${key.padEnd(8)} ${reference}  status=${result.status}  years=[${result.financialStatements
        .map((s) => s.fiscalYear)
        .join(", ")}]  revenue(latest)=${result.financialStatements[0]?.revenue}`,
    );
    if (result.status !== "ANALYSIS_READY") {
      throw new Error(`${key}: expected ANALYSIS_READY, got ${result.status}`);
    }
  }

  console.log("Demo cases seeded through the full extraction pipeline.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
