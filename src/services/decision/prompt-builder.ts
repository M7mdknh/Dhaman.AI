/**
 * Prompt construction for Decision Intelligence — the ONLY place prompt
 * text or input shaping exists. The model receives structured JSON computed
 * by the deterministic engines: never PDFs, never raw statement rows, never
 * personal contact data. Bump PROMPT_VERSION on ANY change to the system
 * prompt or input shape — it invalidates the response cache.
 */
import { GUARANTEE_TYPE_FOCUS } from "@/lib/case-constants";
import { RECOMMENDATION_BY_BAND } from "@/lib/finance/thresholds";
import { contractDurationMonths } from "@/services/finance/financial-intelligence-service";

import type {
  FinancialIntelligenceReport,
  RatioKey,
  ScoreComponent,
} from "@/lib/finance/types";
import type { Recommendation } from "@/lib/validation/decision";
import type { Company, ContractDetails } from "@/generated/prisma/client";

export const PROMPT_VERSION = "v4";

export const SYSTEM_PROMPT = `You are a Senior Corporate Credit Underwriter working for Alinma Bank.

Your role is to assist a Risk Officer evaluating a Letter of Guarantee request. You never make the final decision — the Risk Officer does.

You receive structured financial intelligence in JSON. Every figure was computed by the bank's deterministic engines from audited IFRS statements. These figures are the only source of truth.

Tasks:
1. Summarize the company.
2. Summarize the contract.
3. Explain the company's financial strengths.
4. Explain the company's financial weaknesses.
5. Explain the major financial trends.
6. Explain the significant risk flags.
7. Evaluate the contract relative to the company's financial capacity. Each guarantee product carries a distinct risk profile — "contract.analysisFocus" states what the assessment of this product should emphasize; weave that emphasis into the contract assessment and risk explanation using only the provided figures.
8. State the underwriting recommendation. Bank policy derives the recommendation deterministically from the risk band: the "bankPolicy.policyRecommendation" field in the input IS the recommendation. Return exactly that value and explain the rationale behind it. If the data gives you reservations about it, still return the policy value and state your reservations in "riskExplanation" and "missingInformation".
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
  };
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
  bankPolicy: {
    riskBand: string;
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
): DecisionInput {
  const policyRecommendation = RECOMMENDATION_BY_BAND[report.risk.band];

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
      paymentTerms: contract.expectedPaymentTerms,
    },
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
    bankPolicy: {
      riskBand: report.risk.band,
      policyRecommendation,
      note: "The recommendation of record is derived deterministically from the risk band by bank policy. Echo it and explain it; the Risk Officer makes the final decision.",
    },
  };
}

export function buildUserMessage(input: DecisionInput): string {
  return JSON.stringify(input, null, 2);
}
