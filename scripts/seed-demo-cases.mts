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

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { addFinancialStatement } from "@/services/document-service";
import {
  createDraftCase,
  saveCaseQualitative,
  saveContractDetails,
  submitCase,
} from "@/services/case-service";
import { runCaseProcessing } from "@/services/case-processing-service";

import { ALL_PROFILES, type CompanyProfile } from "../tests/fixtures/company-profiles";
import { textPagesToPdf } from "../tests/fixtures/pdf-writer";
import {
  cashFlowsPage,
  financialPositionPage,
  profitOrLossPage,
} from "../tests/fixtures/statement-text";

import type { CaseQualitativeInput, ContractDetailsInput } from "@/lib/validation/case";

/**
 * Each strength profile belongs to its own seeded company (the generated
 * statements literally carry these company names), so the officer queue shows
 * three DIFFERENT applicants — not one company with three contradictory
 * financial pictures. The Rawabi contractor is the on-stage demo persona;
 * the other two exist to populate the queue realistically.
 */
const APPLICANTS: Record<
  keyof typeof ALL_PROFILES,
  { crNumber: string; email: string; fullName: string }
> = {
  strong: {
    crNumber: "1010111111", // Rawabi Contracting Co.
    email: "contractor@daman.local",
    fullName: "Abdulrahman Yaghmour",
  },
  moderate: {
    crNumber: "2050222222", // Nimah Construction & Trading
    email: "contractor.nimah@daman.local",
    fullName: "Mona Al-Zahrani",
  },
  weak: {
    crNumber: "4030333333", // Faisal Trading & Contracting Est.
    email: "contractor.faisal@daman.local",
    fullName: "Faisal Al-Dossary",
  },
};

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
    additionalNotes: "",
    contractorRole: "MAIN_CONTRACTOR",
    mainContractorName: "",
    backToBackPayment: "",
    awardMethod: "LIMITED_TENDER",
    priorContractsWithBeneficiary: "1",
    advancePaymentPct: "5",
    billingCycle: "MILESTONE",
    retentionPct: "10",
    paymentPeriodDays: "90",
    paymentNotes: "",
    requiredBondPct: "10",
    bondValidityDate: "2028-04-30",
    onFirstDemand: "YES",
    extendOrPay: "NO",
    ldRatePctPerWeek: "0.5",
    ldCapPct: "10",
    mobilizationWeeks: "10",
    keySuppliersIdentified: "NO",
    keySuppliersNote: "",
    expectedGrossMarginPct: "12",
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
    additionalNotes: "",
    // Aggressively won and thinly structured — feeds the weak demo story:
    // subcontract back-to-back payment, no advance, thin margin, tail-risk
    // bond terms.
    contractorRole: "SUBCONTRACTOR",
    mainContractorName: "Gulf Heavy Industries JV",
    backToBackPayment: "YES",
    awardMethod: "PUBLIC_TENDER",
    priorContractsWithBeneficiary: "0",
    advancePaymentPct: "0",
    billingCycle: "MILESTONE",
    retentionPct: "10",
    paymentPeriodDays: "120",
    paymentNotes: "Paid upon main contractor's own receipt of owner certificates.",
    requiredBondPct: "10",
    bondValidityDate: "2029-10-31",
    onFirstDemand: "YES",
    extendOrPay: "YES",
    ldRatePctPerWeek: "1",
    ldCapPct: "15",
    mobilizationWeeks: "16",
    keySuppliersIdentified: "NO",
    keySuppliersNote: "",
    expectedGrossMarginPct: "8",
  },
};

/**
 * KYC questionnaire per profile — the qualitative pillar of each demo story:
 * strong = seasoned Momtaz-adjacent contractor with clean conduct;
 * moderate = growing firm, some strain; weak = young, over-committed,
 * declared conduct incidents (hard-capped at manual review by policy).
 */
const QUALITATIVE: Record<keyof typeof ALL_PROFILES, CaseQualitativeInput> = {
  strong: {
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
  },
  moderate: {
    crIssueDate: "2018-02-20",
    crActivities: "General contracting, enabling and earth works",
    contractorClassification: "GRADE_3",
    partOfGroup: "NO",
    groupName: "",
    gmName: "Mona Al-Zahrani",
    gmExperienceYears: "9",
    ownershipChanged: "NO",
    ownershipChangeNote: "",
    nitaqatBand: "GREEN",
    ongoingLitigation: "NO",
    litigationNote: "",
    projectsCompletedBand: "FROM_10_TO_25",
    largestProjectValue: "35000000",
    hadProjectIssues: "NO",
    projectIssuesNote: "",
    guaranteeCalled: "NO",
    guaranteeCalledNote: "",
    sameTypeExperience: "YES",
    sameTypeExperienceNote: "",
    runningProjectsCount: "6",
    backlogValue: "70000000",
    outstandingGuarantees: "20000000",
    equipmentPlan: "RENT",
    heavyHiringNeeded: "YES",
    mainBank: "Saudi National Bank (SNB)",
    conductIncidents: "NO",
    conductIncidentsNote: "",
    auditorTier: "ACCREDITED_LOCAL",
    auditorName: "Al Kharashi & Co.",
    fundingSource: "THIS_BANK",
  },
  weak: {
    crIssueDate: "2021-11-02",
    crActivities: "Trading and general contracting",
    contractorClassification: "NONE",
    partOfGroup: "NO",
    groupName: "",
    gmName: "Faisal Al-Dossary",
    gmExperienceYears: "4",
    ownershipChanged: "YES",
    ownershipChangeNote: "Founding partner bought out in 2025; GM took over operations.",
    nitaqatBand: "YELLOW",
    ongoingLitigation: "YES",
    litigationNote: "Labor-office dispute over delayed wages on a previous site.",
    projectsCompletedBand: "UNDER_5",
    largestProjectValue: "20000000",
    hadProjectIssues: "YES",
    projectIssuesNote: "A 2024 warehouse fit-out ran five months late with LD deductions.",
    guaranteeCalled: "NO",
    guaranteeCalledNote: "",
    sameTypeExperience: "NO",
    sameTypeExperienceNote: "",
    runningProjectsCount: "3",
    backlogValue: "90000000",
    outstandingGuarantees: "30000000",
    equipmentPlan: "PURCHASE",
    heavyHiringNeeded: "YES",
    mainBank: "Riyad Bank",
    conductIncidents: "YES",
    conductIncidentsNote: "Two cheques returned in 2025 during a client payment dispute; settled.",
    auditorTier: "OTHER_FIRM",
    auditorName: "Dammam Audit Office",
    fundingSource: "SUPPLIER_CREDIT",
  },
};

function profilePdf(profile: CompanyProfile): Buffer {
  return textPagesToPdf([
    financialPositionPage(profile),
    profitOrLossPage(profile),
    cashFlowsPage(profile),
  ]);
}

/** Find-or-create the contractor user for one demo company. */
async function ensureApplicant(applicant: {
  crNumber: string;
  email: string;
  fullName: string;
}) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { crNumber: applicant.crNumber },
  });
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD ?? "Daman!2026", 12);
  return prisma.user.upsert({
    where: { email: applicant.email },
    update: { fullName: applicant.fullName, companyId: company.id },
    create: {
      email: applicant.email,
      fullName: applicant.fullName,
      role: "CONTRACTOR",
      companyId: company.id,
      passwordHash,
    },
  });
}

async function main() {
  const companyIds = [];
  for (const applicant of Object.values(APPLICANTS)) {
    companyIds.push((await ensureApplicant(applicant)).companyId!);
  }

  // Issued guarantees RESTRICT case deletion by design (a bank instrument
  // must never vanish with its case) — for the DEMO reset, remove them first.
  await prisma.guarantee.deleteMany({
    where: { case: { companyId: { in: companyIds } } },
  });
  const removed = await prisma.underwritingCase.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  if (removed.count) console.log(`Removed ${removed.count} previous demo case(s).`);

  for (const [key, profile] of Object.entries(ALL_PROFILES)) {
    const contractor = await ensureApplicant(APPLICANTS[key as keyof typeof APPLICANTS]);
    const draft = await createDraftCase(contractor.id);
    if (!draft.ok) throw new Error(`createDraftCase(${key}): ${draft.error}`);
    const { caseId, reference } = draft.data;

    const kyc = await saveCaseQualitative(contractor.id, caseId, QUALITATIVE[key as keyof typeof QUALITATIVE]);
    if (!kyc.ok) throw new Error(`saveCaseQualitative(${key}): ${kyc.error}`);

    const details = await saveContractDetails(contractor.id, caseId, CONTRACTS[key as keyof typeof CONTRACTS]);
    if (!details.ok) throw new Error(`saveContractDetails(${key}): ${details.error}`);

    const pdf = profilePdf(profile);
    const file = new File([new Uint8Array(pdf)], `${key}-statements-2025.pdf`, {
      type: "application/pdf",
    });
    const upload = await addFinancialStatement(contractor.id, caseId, file, 2025);
    if (!upload.ok) throw new Error(`addFinancialStatement(${key}): ${upload.error}`);

    // Workflow 1 — submission is synchronous and must NOT run the pipeline:
    // it saves the case as PROCESSING with a QUEUED job, and returns fast.
    const submitted = await submitCase(contractor.id, caseId);
    if (!submitted.ok) throw new Error(`submitCase(${key}): ${submitted.error}`);
    const armed = await prisma.underwritingCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { processing: true },
    });
    if (armed.status !== "PROCESSING" || armed.processing?.state !== "QUEUED") {
      throw new Error(
        `${key}: submit should leave PROCESSING/QUEUED, got ${armed.status}/${armed.processing?.state}`,
      );
    }

    // Workflow 2 — the async pipeline (here driven inline; in the app it runs
    // out-of-band via after()) takes it to ANALYSIS_READY.
    await runCaseProcessing(caseId);

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
