/**
 * Prompt construction for Decision Intelligence — the ONLY place prompt
 * text or input shaping exists. The model receives structured JSON computed
 * by the deterministic engines: never PDFs, never raw statement rows, never
 * personal contact data. Bump PROMPT_VERSION on ANY change to the system
 * prompt or input shape — it invalidates the response cache.
 */
import { GUARANTEE_TYPE_FOCUS } from "@/lib/case-constants";
import { contractDurationMonths } from "@/services/finance/financial-intelligence-service";

import type {
  FinancialIntelligenceReport,
  RatioKey,
  ScoreComponent,
} from "@/lib/finance/types";
import type { Recommendation } from "@/lib/validation/decision";
import type { CaseQualitative, Company, ContractDetails } from "@/generated/prisma/client";

export const PROMPT_VERSION = "v6";

export const SYSTEM_PROMPT = `You are a Senior Corporate Credit Underwriter working for Alinma Bank.

Your role is to assist a Risk Officer evaluating a Letter of Guarantee request. You never make the final decision — the Risk Officer does.

You receive structured underwriting intelligence in JSON. Every figure was computed by the bank's deterministic engines from the applicant's statements, KYC questionnaire, and contract terms. These figures are the only source of truth.

Tasks:
1. Summarize the company, drawing on both the financials and the declared company profile ("companyProfile": operating history, track record, workload, conduct).
2. Summarize the contract, including its structure (role, award method, payment mechanics, bond terms).
3. Explain the company's financial strengths.
4. Explain the company's financial weaknesses.
5. Explain the major financial trends.
6. Explain the significant risk flags — including the KYC and contract-structure flags.
7. Evaluate the contract relative to the company's financial capacity. Each guarantee product carries a distinct risk profile — "contract.analysisFocus" states what the assessment of this product should emphasize; weave that emphasis into the contract assessment and risk explanation using only the provided figures.
8. State the underwriting recommendation. Bank policy derives the recommendation deterministically from the composite grade and its hard caps: the "bankPolicy.policyRecommendation" field in the input IS the recommendation. When "bankPolicy.hardCaps" is non-empty, the recommendation was capped — explain each cap's reason in "recommendationReason". Return exactly the policy value; if the data gives you reservations, still return it and state your reservations in "riskExplanation" and "missingInformation".
9. List missing information that would strengthen the assessment.

Rules:
- Respond with a single JSON object and nothing else. No Markdown, no code fences, no commentary.
- Never calculate, estimate, or adjust financial ratios or figures — quote the provided values verbatim.
- Never invent financial information, company history, or market context that is not in the input.
- Write in clear professional banking English, suitable for an internal credit memo.

Return exactly this JSON shape:
{
  "summary": string,                    // executive summary of company + request (one paragraph)
  "companyStrengths": string[],         // each item one complete sentence citing provided figures
  "companyWeaknesses": string[],        // each item one complete sentence citing provided figures
  "contractAssessment": string,         // contract vs financial capacity (one paragraph)
  "riskExplanation": string,            // the significant risk flags and trends, explained
  "recommendation": "APPROVE" | "APPROVE_WITH_CONDITIONS" | "MANUAL_REVIEW" | "REJECT",
  "recommendationReason": string,       // why bank policy reaches this recommendation
  "missingInformation": string[],       // gaps that would strengthen the assessment
  "confidenceExplanation": string,      // how complete/reliable the underlying data is
  "nextSteps": string[]                 // concrete actions for the Risk Officer
}`;

/** Structured, deterministic model input. All money values are decimal strings. */
export interface DecisionInput {
  meta: {
    caseReference: string;
    currency: string;
    fiscalYears: number[];
    latestFiscalYear: number;
    /** Presentation caveats from the deterministic engine (e.g. an
     * order-of-liquidity balance sheet publishes no current ratios) so the
     * memo explains the statement format instead of reporting "missing data". */
    statementPresentationNotes: string[];
  };
  company: {
    name: string;
    crNumber: string;
    sector: string;
    city: string;
  };
  contract: {
    title: string;
    description: string | null;
    beneficiary: string;
    beneficiaryType: string;
    sector: string;
    location: string;
    value: string;
    currency: string;
    guaranteeAmount: string;
    guaranteeType: string;
    /** Product-specific underwriting emphasis (framework §3) — guidance for
     * the narrative, never an input to any calculation. */
    analysisFocus: string;
    guaranteePercentage: string | null;
    projectStartDate: string;
    projectEndDate: string;
    durationMonths: number | null;
    paymentTerms: string | null;
    /** Structured contract terms (null on cases predating the detailed form). */
    structure: {
      contractorRole: string | null;
      backToBackPayment: boolean | null;
      awardMethod: string | null;
      priorContractsWithBeneficiary: number | null;
      advancePaymentPct: string | null;
      billingCycle: string | null;
      retentionPct: string | null;
      paymentPeriodDays: number | null;
      requiredBondPct: string | null;
      onFirstDemand: boolean | null;
      extendOrPay: boolean | null;
      liquidatedDamages: string | null;
      mobilizationWeeks: number | null;
      expectedGrossMarginPct: string | null;
    } | null;
  };
  /** Declared KYC profile (null on cases predating the questionnaire).
   * Facts for the narrative — every score derived from them arrives
   * separately in qualitativeAssessment. */
  companyProfile: {
    crIssueDate: string;
    partOfGroup: boolean;
    groupName: string | null;
    ownershipChangedLast2Years: boolean;
    nitaqatBand: string;
    ongoingLitigation: boolean;
    projectsCompletedBand: string;
    hadProjectIssues: boolean;
    guaranteeEverCalled: boolean;
    sameTypeExperience: boolean;
    runningProjectsCount: number;
    backlogValue: string;
    outstandingGuaranteesAllBanks: string;
    heavyHiringNeeded: boolean;
    mainBank: string;
    conductIncidentsDeclared: boolean;
    auditorTier: string;
    auditorName: string | null;
    fundingUntilFirstPayment: string;
  } | null;
  financialRatios: {
    fiscalYear: number;
    liquidity: Partial<Record<RatioKey, number | null>>;
    leverage: Partial<Record<RatioKey, number | null>>;
    profitability: Partial<Record<RatioKey, number | null>>;
    efficiency: Partial<Record<RatioKey, number | null>>;
    cashFlowAndCoverage: Partial<Record<RatioKey, number | null>>;
    workingCapital: string | null;
    freeCashFlow: string | null;
  }[];
  /** Growth figures are pre-formatted percent strings ("+12.3%") so the model
   * quotes them correctly — a raw fraction (0.123) invites misquoting. */
  growth: {
    period: string;
    revenueGrowth: string | null;
    assetGrowth: string | null;
    equityGrowth: string | null;
    cashGrowth: string | null;
    netIncomeGrowth: string | null;
  }[];
  trends: { metric: string; direction: string | null; latestChange: string | null }[];
  riskFlags: { type: string; severity: string; explanation: string; affectedYears: number[] }[];
  underwritingCapacity: {
    score: number;
    band: string;
    components: { label: string; weight: number; score: number | null; detail: string }[];
    missingInputs: string[];
  };
  riskScore: {
    score: number;
    band: string;
    components: { label: string; weight: number; score: number | null; detail: string }[];
    missingInputs: string[];
  };
  /** Qualitative (KYC) pillar — null on cases predating the questionnaire. */
  qualitativeAssessment: {
    score: number;
    band: string;
    components: { label: string; weight: number; score: number | null; detail: string }[];
    missingInputs: string[];
  } | null;
  /** Contract-risk pillar — null without the structured contract fields. */
  contractRiskAssessment: {
    score: number;
    band: string;
    components: { label: string; weight: number; score: number | null; detail: string }[];
    missingInputs: string[];
  } | null;
  bankPolicy: {
    /** Composite grade over the available pillars (weights included). */
    overallScore: number;
    overallBand: string;
    pillars: { label: string; weight: number; score: number | null; band: string | null }[];
    /** Non-dilutable overrides that capped the recommendation (may be empty). */
    hardCaps: { type: string; ceiling: string; reason: string }[];
    confidence: string;
    confidenceDetail: string;
    policyRecommendation: Recommendation;
    note: string;
  };
}

/** Ratios are handed to the model at memo precision (2dp) — it quotes values
 * verbatim, and "2.33" belongs in a credit memo where "2.3333" does not. */
const memoPrecision = (value: number | null): number | null =>
  value === null ? null : Number(value.toFixed(2));

/** Growth/change fractions become signed percent strings ("+12.3%") — the one
 * format the model cannot misquote. Same idea for percentage-point moves. */
const pct = (fraction: number | null): string | null =>
  fraction === null ? null : `${fraction > 0 ? "+" : ""}${(fraction * 100).toFixed(1)}%`;
const pp = (fraction: number | null): string | null =>
  fraction === null ? null : `${fraction > 0 ? "+" : ""}${(fraction * 100).toFixed(1)}pp`;

const pickRatios = (
  ratios: Record<RatioKey, number | null>,
  keys: RatioKey[],
): Partial<Record<RatioKey, number | null>> =>
  Object.fromEntries(keys.map((k) => [k, memoPrecision(ratios[k])]));

const mapComponents = (components: ScoreComponent[]) =>
  components.map(({ label, weight, score, detail }) => ({ label, weight, score, detail }));

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function buildDecisionInput(
  caseReference: string,
  company: Company,
  contract: ContractDetails,
  report: FinancialIntelligenceReport,
  qualitative: CaseQualitative | null = null,
): DecisionInput {
  const dec = (d: { toFixed(n: number): string } | null) => d?.toFixed(2) ?? null;

  return {
    meta: {
      caseReference,
      currency: report.currency,
      fiscalYears: report.years,
      latestFiscalYear: report.latestYear,
      statementPresentationNotes: report.disclosures.orderOfLiquidity
        ? [
            "The balance sheet is presented in order of liquidity (standard for banks and finance companies): " +
              "no current/non-current split is published, so current ratio, quick ratio, OCF ratio, and working " +
              "capital are not disclosed by this statement format. Describe them as not applicable to this " +
              "presentation — do not list them as missing records or request them from the applicant.",
          ]
        : [],
    },
    // Registration data only — personal contact fields are deliberately excluded.
    company: {
      name: company.name,
      crNumber: company.crNumber,
      sector: company.sector,
      city: company.city,
    },
    contract: {
      title: contract.contractTitle,
      description: contract.contractDescription,
      beneficiary: contract.beneficiary,
      beneficiaryType: contract.beneficiaryType,
      sector: contract.sector,
      location: contract.projectLocation,
      value: contract.contractValue.toFixed(2),
      currency: contract.currency,
      guaranteeAmount: contract.guaranteeAmount.toFixed(2),
      guaranteeType: contract.guaranteeType,
      analysisFocus: GUARANTEE_TYPE_FOCUS[contract.guaranteeType],
      guaranteePercentage: contract.guaranteePercentage?.toFixed(2) ?? null,
      projectStartDate: isoDate(contract.projectStartDate),
      projectEndDate: isoDate(contract.projectEndDate),
      durationMonths: contractDurationMonths(contract),
      paymentTerms: contract.paymentNotes ?? contract.expectedPaymentTerms,
      structure: contract.contractorRole
        ? {
            contractorRole: contract.contractorRole,
            backToBackPayment: contract.backToBackPayment,
            awardMethod: contract.awardMethod,
            priorContractsWithBeneficiary: contract.priorContractsWithBeneficiary,
            advancePaymentPct: dec(contract.advancePaymentPct),
            billingCycle: contract.billingCycle,
            retentionPct: dec(contract.retentionPct),
            paymentPeriodDays: contract.paymentPeriodDays,
            requiredBondPct: dec(contract.requiredBondPct),
            onFirstDemand: contract.onFirstDemand,
            extendOrPay: contract.extendOrPay,
            liquidatedDamages:
              contract.ldRatePctPerWeek !== null && contract.ldCapPct !== null
                ? `${contract.ldRatePctPerWeek.toFixed(2)}% per week, capped at ${contract.ldCapPct.toFixed(1)}% of contract value`
                : null,
            mobilizationWeeks: contract.mobilizationWeeks,
            expectedGrossMarginPct: dec(contract.expectedGrossMarginPct),
          }
        : null,
    },
    companyProfile: qualitative
      ? {
          crIssueDate: isoDate(qualitative.crIssueDate),
          partOfGroup: qualitative.partOfGroup,
          groupName: qualitative.groupName,
          ownershipChangedLast2Years: qualitative.ownershipChanged,
          nitaqatBand: qualitative.nitaqatBand,
          ongoingLitigation: qualitative.ongoingLitigation,
          projectsCompletedBand: qualitative.projectsCompletedBand,
          hadProjectIssues: qualitative.hadProjectIssues,
          guaranteeEverCalled: qualitative.guaranteeCalled,
          sameTypeExperience: qualitative.sameTypeExperience,
          runningProjectsCount: qualitative.runningProjectsCount,
          backlogValue: qualitative.backlogValue.toFixed(2),
          outstandingGuaranteesAllBanks: qualitative.outstandingGuarantees.toFixed(2),
          heavyHiringNeeded: qualitative.heavyHiringNeeded,
          mainBank: qualitative.mainBank,
          conductIncidentsDeclared: qualitative.conductIncidents,
          auditorTier: qualitative.auditorTier,
          auditorName: qualitative.auditorName,
          fundingUntilFirstPayment: qualitative.fundingSource,
        }
      : null,
    financialRatios: report.ratiosByYear.map((y) => ({
      fiscalYear: y.fiscalYear,
      liquidity: pickRatios(y.ratios, ["currentRatio", "quickRatio", "cashRatio"]),
      leverage: pickRatios(y.ratios, ["debtRatio", "debtToEquity", "debtToAssets", "interestCoverage"]),
      profitability: pickRatios(y.ratios, [
        "grossMargin",
        "operatingMargin",
        "netMargin",
        "returnOnAssets",
        "returnOnEquity",
        "ebitdaMargin",
      ]),
      efficiency: pickRatios(y.ratios, ["assetTurnover", "inventoryTurnover", "receivableTurnover"]),
      cashFlowAndCoverage: pickRatios(y.ratios, ["operatingCashFlowRatio", "dscr", "ebitdaCoverage"]),
      workingCapital: y.workingCapital,
      freeCashFlow: y.freeCashFlow,
    })),
    growth: report.growthPeriods.map((p) => ({
      period: `FY${p.fromYear} → FY${p.toYear}`,
      revenueGrowth: pct(p.growth.revenueGrowth),
      assetGrowth: pct(p.growth.assetGrowth),
      equityGrowth: pct(p.growth.equityGrowth),
      cashGrowth: pct(p.growth.cashGrowth),
      netIncomeGrowth: pct(p.growth.netIncomeGrowth),
    })),
    trends: report.trends.map((t) => {
      const change = t.yoyChanges.at(-1)?.changePct ?? null;
      return {
        metric: t.label,
        direction: t.direction,
        // Margin trends move in percentage POINTS; money trends in percent.
        latestChange: t.unit === "percent" ? pp(change) : pct(change),
      };
    }),
    riskFlags: report.flags.map((f) => ({
      type: f.type,
      severity: f.severity,
      explanation: f.explanation,
      affectedYears: f.affectedYears,
    })),
    underwritingCapacity: report.capacity
      ? {
          score: report.capacity.score,
          band: report.capacity.band,
          components: mapComponents(report.capacity.components),
          missingInputs: report.capacity.missingInputs,
        }
      : { score: 0, band: "UNAVAILABLE", components: [], missingInputs: ["Contract details"] },
    riskScore: {
      score: report.risk.score,
      band: report.risk.band,
      components: mapComponents(report.risk.components),
      missingInputs: report.risk.missingInputs,
    },
    qualitativeAssessment: report.qualitative
      ? {
          score: report.qualitative.score,
          band: report.qualitative.band,
          components: mapComponents(report.qualitative.components),
          missingInputs: report.qualitative.missingInputs,
        }
      : null,
    contractRiskAssessment: report.contractRisk
      ? {
          score: report.contractRisk.score,
          band: report.contractRisk.band,
          components: mapComponents(report.contractRisk.components),
          missingInputs: report.contractRisk.missingInputs,
        }
      : null,
    bankPolicy: {
      overallScore: report.overall.score,
      overallBand: report.overall.band,
      pillars: report.overall.pillars.map(({ label, weight, score, band }) => ({
        label,
        weight,
        score,
        band,
      })),
      hardCaps: report.overall.caps.map(({ type, ceiling, reason }) => ({
        type,
        ceiling,
        reason,
      })),
      confidence: report.overall.confidence,
      confidenceDetail: report.overall.confidenceDetail,
      policyRecommendation: report.overall.recommendation,
      note: "The recommendation of record is derived deterministically from the composite grade (financial + qualitative + contract pillars) with hard caps applied by bank policy. Echo it and explain it; the Risk Officer makes the final decision.",
    },
  };
}

export function buildUserMessage(input: DecisionInput): string {
  return JSON.stringify(input, null, 2);
}
