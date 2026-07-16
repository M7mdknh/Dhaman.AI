/**
 * QA VERIFICATION SETUP — creates disposable test cases through the REAL
 * service layer (same code paths as the app). Deleted by .verify-cleanup.mts.
 *
 *  Case A — clean strong case, submitted but NOT processed inline: the
 *           browser walkthrough drives the real server-side pipeline.
 *  Case B — draft only: target for the presigned direct-to-R2 upload test.
 *  Case C — good 2025 statement + garbage 2024 PDF: proves one failed
 *           document never blocks the case (processed inline).
 *  Case D — garbage-only statement: proves graceful failure + retry
 *           mechanics (processed inline, then retried).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { addFinancialStatement } from "@/services/document-service";
import {
  createDraftCase,
  saveCaseQualitative,
  saveContractDetails,
  submitCase,
} from "@/services/case-service";
import { retryProcessing, runCaseProcessing } from "@/services/case-processing-service";

import { STRONG_PROFILE } from "../tests/fixtures/company-profiles";
import { textPagesToPdf } from "../tests/fixtures/pdf-writer";
import {
  cashFlowsPage,
  financialPositionPage,
  profitOrLossPage,
} from "../tests/fixtures/statement-text";

import type { CaseQualitativeInput, ContractDetailsInput } from "@/lib/validation/case";

const CONTRACT: ContractDetailsInput = {
  beneficiary: "Ministry of Municipal and Rural Affairs",
  beneficiaryType: "GOVERNMENT",
  contractTitle: "QA Verification — Riyadh Roads Package",
  contractDescription: "Disposable QA verification case.",
  sector: "Infrastructure",
  contractValue: "60000000",
  currency: "SAR",
  guaranteeAmount: "6000000",
  guaranteeType: "PERFORMANCE",
  guaranteePercentage: "10",
  projectStartDate: "2026-09-01",
  projectEndDate: "2028-08-31",
  projectLocation: "Riyadh",
  additionalNotes: "",
  contractorRole: "MAIN_CONTRACTOR",
  mainContractorName: "",
  backToBackPayment: "",
  awardMethod: "PUBLIC_TENDER",
  priorContractsWithBeneficiary: "3",
  advancePaymentPct: "10",
  billingCycle: "MONTHLY",
  retentionPct: "5",
  paymentPeriodDays: "60",
  paymentNotes: "Monthly progress certificates, 60 days",
  requiredBondPct: "10",
  bondValidityDate: "2028-10-31",
  onFirstDemand: "YES",
  extendOrPay: "NO",
  ldRatePctPerWeek: "0.25",
  ldCapPct: "10",
  mobilizationWeeks: "8",
  keySuppliersIdentified: "YES",
  keySuppliersNote: "Asphalt and aggregates under framework agreements",
  expectedGrossMarginPct: "15",
};

const QUALITATIVE: CaseQualitativeInput = {
  crIssueDate: "2012-05-14",
  crActivities: "Road construction, bridges, and public infrastructure works",
  contractorClassification: "GRADE_1",
  partOfGroup: "NO",
  groupName: "",
  gmName: "Khalid Al-Harbi",
  gmExperienceYears: "18",
  ownershipChanged: "NO",
  ownershipChangeNote: "",
  nitaqatBand: "PLATINUM",
  ongoingLitigation: "NO",
  litigationNote: "",
  projectsCompletedBand: "OVER_25",
  largestProjectValue: "45000000",
  hadProjectIssues: "NO",
  projectIssuesNote: "",
  guaranteeCalled: "NO",
  guaranteeCalledNote: "",
  sameTypeExperience: "YES",
  sameTypeExperienceNote: "Three MOMRA road packages delivered since 2019",
  runningProjectsCount: "5",
  backlogValue: "40000000",
  outstandingGuarantees: "12000000",
  equipmentPlan: "OWNED",
  heavyHiringNeeded: "NO",
  mainBank: "Alinma Bank",
  conductIncidents: "NO",
  conductIncidentsNote: "",
  auditorTier: "BIG_FOUR",
  auditorName: "PwC",
  fundingSource: "OWN_CASH",
};

function goodPdf(): Buffer {
  return textPagesToPdf([
    financialPositionPage(STRONG_PROFILE),
    profitOrLossPage(STRONG_PROFILE),
    cashFlowsPage(STRONG_PROFILE),
  ]);
}

function garbagePdf(): Buffer {
  return textPagesToPdf([
    "Meeting minutes — Q3 planning session.\nAttendees: project team.\nThis document is not a financial statement.",
  ]);
}

async function buildCase(
  contractorId: string,
  docs: { pdf: Buffer; year: number; name: string }[],
) {
  const draft = await createDraftCase(contractorId);
  if (!draft.ok) throw new Error(`createDraftCase: ${draft.error}`);
  const { caseId, reference } = draft.data;
  const kyc = await saveCaseQualitative(contractorId, caseId, QUALITATIVE);
  if (!kyc.ok) throw new Error(`saveCaseQualitative: ${kyc.error}`);
  const details = await saveContractDetails(contractorId, caseId, CONTRACT);
  if (!details.ok) throw new Error(`saveContractDetails: ${details.error}`);
  for (const d of docs) {
    const file = new File([new Uint8Array(d.pdf)], d.name, { type: "application/pdf" });
    const up = await addFinancialStatement(contractorId, caseId, file, d.year);
    if (!up.ok) throw new Error(`addFinancialStatement(${d.name}): ${up.error}`);
  }
  return { caseId, reference };
}

async function submitTimed(contractorId: string, caseId: string) {
  const t0 = Date.now();
  const submitted = await submitCase(contractorId, caseId);
  const ms = Date.now() - t0;
  if (!submitted.ok) throw new Error(`submitCase: ${submitted.error}`);
  const armed = await prisma.underwritingCase.findUniqueOrThrow({
    where: { id: caseId },
    include: { processing: true },
  });
  if (armed.status !== "PROCESSING" || armed.processing?.state !== "QUEUED") {
    throw new Error(`submit left ${armed.status}/${armed.processing?.state}, expected PROCESSING/QUEUED`);
  }
  return ms;
}

async function docStatuses(caseId: string) {
  const docs = await prisma.document.findMany({
    where: { caseId },
    select: { fileName: true, processingStatus: true, fiscalYear: true },
    orderBy: { fiscalYear: "desc" },
  });
  return docs.map((d) => `${d.fiscalYear}:${d.fileName}=${d.processingStatus}`).join(", ");
}

const contractor = await prisma.user.findUniqueOrThrow({
  where: { email: "contractor@daman.local" },
});
const out: Record<string, unknown> = {};

// ---- Case A: clean, submitted, pipeline left QUEUED for the browser ----
const a = await buildCase(contractor.id, [
  { pdf: goodPdf(), year: 2025, name: "qa-strong-statements-2025.pdf" },
]);
out.caseA = { ...a, submitMs: await submitTimed(contractor.id, a.caseId) };
console.log(`CASE A ${a.reference} ${a.caseId} submitted in ${(out.caseA as { submitMs: number }).submitMs}ms — left QUEUED for the browser`);

// ---- Case B: draft only (presign target) ----
const b = await buildCase(contractor.id, []);
out.caseB = b;
console.log(`CASE B ${b.reference} ${b.caseId} draft (presign target)`);

// ---- Case C: good + garbage docs — failure isolation ----
const c = await buildCase(contractor.id, [
  { pdf: goodPdf(), year: 2025, name: "qa-good-2025.pdf" },
  { pdf: garbagePdf(), year: 2024, name: "qa-garbage-2024.pdf" },
]);
const cSubmitMs = await submitTimed(contractor.id, c.caseId);
let t0 = Date.now();
await runCaseProcessing(c.caseId);
const cPipelineMs = Date.now() - t0;
const cCase = await prisma.underwritingCase.findUniqueOrThrow({ where: { id: c.caseId } });
out.caseC = {
  ...c,
  submitMs: cSubmitMs,
  pipelineMs: cPipelineMs,
  status: cCase.status,
  docs: await docStatuses(c.caseId),
};
console.log(`CASE C ${c.reference} status=${cCase.status} pipeline=${cPipelineMs}ms docs=[${(out.caseC as { docs: string }).docs}]`);

// ---- Case D: garbage only — graceful failure + retry ----
const d = await buildCase(contractor.id, [
  { pdf: garbagePdf(), year: 2025, name: "qa-garbage-only-2025.pdf" },
]);
const dSubmitMs = await submitTimed(contractor.id, d.caseId);
t0 = Date.now();
await runCaseProcessing(d.caseId);
const dFailMs = Date.now() - t0;
const dJob1 = await prisma.caseProcessing.findUniqueOrThrow({ where: { caseId: d.caseId } });
const dCase1 = await prisma.underwritingCase.findUniqueOrThrow({ where: { id: d.caseId } });
console.log(
  `CASE D ${d.reference} after run 1: case=${dCase1.status} job=${dJob1.state} failedStage=${dJob1.failedStage} attempts=${dJob1.attempts} error="${dJob1.error}"`,
);

const retried = await retryProcessing(contractor.id, d.caseId);
const dJob2 = await prisma.caseProcessing.findUniqueOrThrow({ where: { caseId: d.caseId } });
console.log(`CASE D retry: ok=${retried.ok} job=${dJob2.state} attempts=${dJob2.attempts}`);
await runCaseProcessing(d.caseId);
const dJob3 = await prisma.caseProcessing.findUniqueOrThrow({ where: { caseId: d.caseId } });
const dCase3 = await prisma.underwritingCase.findUniqueOrThrow({ where: { id: d.caseId } });
out.caseD = {
  ...d,
  submitMs: dSubmitMs,
  failMs: dFailMs,
  firstRun: { case: dCase1.status, job: dJob1.state, failedStage: dJob1.failedStage, attempts: dJob1.attempts, error: dJob1.error },
  retryAccepted: retried.ok,
  afterRetry: { case: dCase3.status, job: dJob3.state, failedStage: dJob3.failedStage, attempts: dJob3.attempts, error: dJob3.error },
};
console.log(
  `CASE D after retry run: case=${dCase3.status} job=${dJob3.state} attempts=${dJob3.attempts} error="${dJob3.error}"`,
);

writeFileSync(
  "/tmp/claude-1000/-home-muhammad-Documents-Wakeel-AI-Wakeel-V2/6e751863-b034-42b5-9f59-eb8b35f3a97b/scratchpad/verify-cases.json",
  JSON.stringify(out, null, 2),
);
console.log("SETUP OK");
await prisma.$disconnect();
