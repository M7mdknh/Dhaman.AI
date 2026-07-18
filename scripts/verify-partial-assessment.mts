/**
 * Live verification: one failed document must NEVER fail the case.
 *
 * Drives the REAL services end-to-end (comprehensive mode so both documents
 * are read): a case with one good statement (FY2025) and one unreadable PDF
 * (FY2024) must reach ANALYSIS_READY with a COMPLETED job, FinancialStatement
 * rows from the good document, and the bad document individually FAILED.
 * Then a retry (allowed on the partial case) must RESUME — the good document's
 * checkpoint is reused, never re-extracted.
 *
 * Cleans up after itself. Never run against production data you care about.
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { createDraftCase, saveContractDetails, submitCase } from "@/services/case-service";
import { addFinancialStatement } from "@/services/document-service";
import { retryProcessing, runCaseProcessing } from "@/services/case-processing-service";

import { ALL_PROFILES } from "../tests/fixtures/company-profiles";
import { textPagesToPdf } from "../tests/fixtures/pdf-writer";
import {
  cashFlowsPage,
  financialPositionPage,
  profitOrLossPage,
} from "../tests/fixtures/statement-text";

function goodPdf(): Buffer {
  const profile = ALL_PROFILES.strong;
  return textPagesToPdf([
    financialPositionPage(profile),
    profitOrLossPage(profile),
    cashFlowsPage(profile),
  ]);
}

/** A structurally valid but contentless PDF — extraction must fail honestly. */
function badPdf(): Buffer {
  return textPagesToPdf(["This document contains no financial statements at all."]);
}

async function main() {
  if (process.env.UNDERWRITING_MODE !== "comprehensive") {
    throw new Error("Run with UNDERWRITING_MODE=comprehensive (partial needs ≥2 documents read)");
  }
  const contractor = await prisma.user.findUniqueOrThrow({
    where: { email: "contractor@dhaman.local" },
  });

  const draft = await createDraftCase(contractor.id);
  if (!draft.ok) throw new Error(draft.error);
  const { caseId, reference } = draft.data;
  console.log(`case ${reference} (${caseId})`);

  try {
    const details = await saveContractDetails(contractor.id, caseId, {
      beneficiary: "Verification Beneficiary",
      beneficiaryType: "GOVERNMENT",
      contractTitle: "Partial Assessment Verification",
      contractDescription: "",
      sector: "Infrastructure",
      contractValue: "60000000",
      currency: "SAR",
      guaranteeAmount: "6000000",
      guaranteeType: "PERFORMANCE",
      guaranteePercentage: "10",
      projectStartDate: "2026-09-01",
      projectEndDate: "2028-08-31",
      projectLocation: "Riyadh",
      expectedPaymentTerms: "",
      additionalNotes: "",
    });
    if (!details.ok) throw new Error(details.error);

    for (const [year, bytes, name] of [
      [2025, goodPdf(), "good-2025.pdf"],
      [2024, badPdf(), "bad-2024.pdf"],
    ] as const) {
      const file = new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
      const up = await addFinancialStatement(contractor.id, caseId, file, year);
      if (!up.ok) throw new Error(`upload ${name}: ${up.error}`);
    }

    const submitted = await submitCase(contractor.id, caseId);
    if (!submitted.ok) throw new Error(submitted.error);
    await runCaseProcessing(caseId);

    const state = await prisma.underwritingCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { processing: true, financialStatements: true, documents: true },
    });
    const byName = Object.fromEntries(state.documents.map((d) => [d.fileName, d.processingStatus]));
    console.log(
      `case=${state.status} job=${state.processing?.state} years=[${state.financialStatements
        .map((s) => s.fiscalYear)
        .join(",")}] docs=${JSON.stringify(byName)}`,
    );

    const assert = (cond: boolean, msg: string) => {
      if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
      console.log(`✓ ${msg}`);
    };
    assert(state.status === "ANALYSIS_READY", "case is ANALYSIS_READY despite one failed document");
    assert(state.processing?.state === "COMPLETED", "job COMPLETED (partial assessment)");
    assert(byName["good-2025.pdf"] === "COMPLETED", "good document COMPLETED");
    assert(byName["bad-2024.pdf"] === "FAILED", "bad document FAILED individually");
    assert(state.financialStatements.length > 0, "FinancialStatement rows exist from the good document");

    // Retry must be permitted on a completed-partial case, and must RESUME.
    const goodExtractionBefore = await prisma.documentExtraction.findFirstOrThrow({
      where: { document: { fileName: "good-2025.pdf", caseId } },
    });
    const retry = await retryProcessing(contractor.id, caseId);
    assert(retry.ok === true, `retry allowed on partial case (${JSON.stringify(retry)})`);
    await runCaseProcessing(caseId);
    const goodExtractionAfter = await prisma.documentExtraction.findFirstOrThrow({
      where: { document: { fileName: "good-2025.pdf", caseId } },
    });
    assert(
      goodExtractionAfter.completedAt.getTime() === goodExtractionBefore.completedAt.getTime(),
      "resume reused the good document's checkpoint (no re-extraction)",
    );
    const after = await prisma.underwritingCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { processing: true },
    });
    assert(after.status === "ANALYSIS_READY", "case back to ANALYSIS_READY after resume");

    console.log("\nPARTIAL ASSESSMENT VERIFIED ✅");
  } finally {
    // Clean up the verification case entirely.
    await prisma.underwritingCase.delete({ where: { id: caseId } }).catch((e) => {
      console.error("cleanup failed:", e);
    });
    console.log("verification case removed");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
