/**
 * Prisma-shaped Company/ContractDetails objects + an engine report for the
 * decision tests, built from the shared strong demo profile so figures stay
 * consistent with every other fixture.
 */
import { Prisma } from "@/generated/prisma/client";
import { assessExecutionCapacity } from "@/services/finance/execution-capacity-service";
import { computeGrowth, computeRatios } from "@/services/finance/financial-ratio-service";
import { composeOverallGrade } from "@/services/finance/overall-grade-service";
import { detectRiskFlags } from "@/services/finance/risk-flag-service";
import { assessRisk } from "@/services/finance/risk-score-service";
import { computeTrends } from "@/services/finance/trend-analysis-service";

import { STRONG_PROFILE } from "./company-profiles";
import { contractInputs } from "./contract-inputs";
import { toEngineYear } from "./year-financials";

import type { FinancialIntelligenceReport } from "@/lib/finance/types";
import type { Company, ContractDetails } from "@/generated/prisma/client";

const D = (n: number) => new Prisma.Decimal(n);

export function strongCompany(): Company {
  return {
    id: "company-1",
    name: STRONG_PROFILE.name,
    crNumber: "1010111111",
    sector: "Construction",
    city: "Riyadh",
    contactPerson: "Khalid Al-Harbi",
    contactEmail: "khalid@rawabi.example",
    phone: "+966500000000",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

export function strongContract(): ContractDetails {
  return {
    id: "contract-1",
    caseId: "case-1",
    beneficiary: "Ministry of Municipal and Rural Affairs",
    beneficiaryType: "GOVERNMENT",
    contractTitle: "Riyadh North District Roads Package 3",
    contractDescription: "Road works and utilities.",
    sector: "Infrastructure",
    projectLocation: "Riyadh",
    contractValue: D(60_000_000),
    currency: "SAR",
    guaranteeAmount: D(6_000_000),
    guaranteeType: "PERFORMANCE",
    guaranteePercentage: D(10),
    projectStartDate: new Date("2026-09-01T00:00:00Z"),
    projectEndDate: new Date("2028-08-31T00:00:00Z"),
    expectedPaymentTerms: "Monthly certified progress payments",
    additionalNotes: null,
    // Structured Step-3 fields stay null (a legacy-shaped contract): the
    // decision tests hand-verify the financial pillar, and null structured
    // fields keep overall == financial without re-deriving expectations.
    contractorRole: null,
    mainContractorName: null,
    backToBackPayment: null,
    awardMethod: null,
    priorContractsWithBeneficiary: null,
    advancePaymentPct: null,
    billingCycle: null,
    retentionPct: null,
    paymentPeriodDays: null,
    paymentNotes: null,
    requiredBondPct: null,
    bondValidityDate: null,
    onFirstDemand: null,
    extendOrPay: null,
    ldRatePctPerWeek: null,
    ldCapPct: null,
    mobilizationWeeks: null,
    keySuppliersIdentified: null,
    keySuppliersNote: null,
    expectedGrossMarginPct: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
  };
}

/** Deterministic engine report over the strong profile + strong contract. */
export function strongReport(): FinancialIntelligenceReport {
  const years = STRONG_PROFILE.years.map(toEngineYear).sort((a, b) => a.fiscalYear - b.fiscalYear);
  const latest = years.at(-1)!;
  const contract = contractInputs({
    contractValue: D(60_000_000),
    guaranteeAmount: D(6_000_000),
    beneficiaryType: "GOVERNMENT",
    durationMonths: 24,
  });
  const flags = detectRiskFlags(years);
  const risk = assessRisk(years, flags, contract);
  return {
    years: years.map((y) => y.fiscalYear),
    latestYear: latest.fiscalYear,
    currency: "SAR",
    disclosures: { orderOfLiquidity: false },
    ratiosByYear: computeRatios(years),
    growthPeriods: computeGrowth(years),
    trends: computeTrends(years),
    flags,
    risk,
    capacity: assessExecutionCapacity(latest, contract),
    qualitative: null,
    contractRisk: null,
    overall: composeOverallGrade(risk, null, null, [], ["AUDITED", "AUDITED", "AUDITED"]),
  };
}
