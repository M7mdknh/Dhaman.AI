import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { detectRiskFlags } from "@/services/finance/risk-flag-service";
import { assessRisk, riskBandFor } from "@/services/finance/risk-score-service";

import { STRONG_PROFILE, WEAK_PROFILE } from "../fixtures/company-profiles";
import { EMPTY_YEAR, toEngineYear } from "../fixtures/year-financials";

import type { YearFinancials } from "@/lib/finance/types";
import type { YearFigures } from "../fixtures/company-profiles";

const D = (n: number) => new Prisma.Decimal(n);

const STRONG_CONTRACT = {
  contractValue: D(60_000_000),
  guaranteeAmount: D(6_000_000),
  beneficiaryType: "GOVERNMENT" as const,
  durationMonths: 24,
};

const WEAK_CONTRACT = {
  contractValue: D(75_000_000),
  guaranteeAmount: D(7_500_000),
  beneficiaryType: "PRIVATE" as const,
  durationMonths: 36,
};

/** Ascending years + flags, exactly as the orchestrator feeds the engine. */
function inputs(profileYears: YearFigures[]) {
  const years = profileYears
    .map(toEngineYear)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
  return { years, flags: detectRiskFlags(years) };
}

describe("risk score engine (hand-computed)", () => {
  it("scores the strong profile + government contract at 2/EXCELLENT", () => {
    const { years, flags } = inputs(STRONG_PROFILE.years);
    expect(flags).toEqual([]); // healthy two-year history triggers nothing

    const result = assessRisk(years, flags, STRONG_CONTRACT);
    const byKey = Object.fromEntries(result.components.map((c) => [c.key, c.score]));

    expect(byKey.liquidity).toBe(1); // CR 2.33 ≥ 1.5
    expect(byKey.leverage).toBe(1); // D/E 0.60 ≤ 1.0
    expect(byKey.profitability).toBe(1); // net margin 11.7% ≥ 8%
    expect(byKey.coverage).toBe(1); // IC fallback 9.0 ≥ 3.0 (EBITDA not printed)
    expect(byKey.trend).toBeCloseTo(0.9, 6); // 0.7 + capped(+20% revenue) − 0 flags
    expect(byKey.contractExposure).toBe(1); // 0.08× equity, 0.5× revenue, gov bonus

    // safety = (15+15+15+20 + 15·0.9 + 20)/100 = 0.985 → risk = round(1.5) = 2
    expect(result.score).toBe(2);
    expect(result.band).toBe("EXCELLENT");
    expect(result.missingInputs).toEqual([]);
  });

  it("scores the distressed profile + oversized private contract at 92/CRITICAL", () => {
    const { years, flags } = inputs(WEAK_PROFILE.years);
    const result = assessRisk(years, flags, WEAK_CONTRACT);
    const byKey = Object.fromEntries(result.components.map((c) => [c.key, c.score]));

    expect(byKey.liquidity).toBe(0); // CR 0.89
    expect(byKey.leverage).toBe(0); // D/E 4.0
    expect(byKey.profitability).toBe(0); // negative margin
    expect(byKey.coverage).toBe(0); // IC 0.2
    expect(byKey.trend).toBe(0); // −33% revenue + 6 HIGH / 2 MEDIUM flags
    // exposure = 1 − (0.625−0.3)/0.7·0.6 − 0.3 = 0.42143
    expect(byKey.contractExposure).toBeCloseTo(0.4214, 3);

    // safety = 20·0.42143/100 = 0.08429 → risk = round(91.57) = 92
    expect(result.score).toBe(92);
    expect(result.band).toBe("CRITICAL");
  });

  it("excludes contract exposure without contract details and renormalizes", () => {
    const { years, flags } = inputs(STRONG_PROFILE.years);
    const result = assessRisk(years, flags, null);

    expect(result.missingInputs).toEqual(["Contract exposure"]);
    // safety = (15+15+15+20 + 13.5)/80 = 0.98125 → risk = round(1.875) = 2
    expect(result.score).toBe(2);
    expect(result.band).toBe("EXCELLENT");
  });

  it("treats a single fiscal year as a neutral trend, not a missing one", () => {
    const latest = toEngineYear(STRONG_PROFILE.years[0]);
    const result = assessRisk([latest], detectRiskFlags([latest]), STRONG_CONTRACT);
    const trend = result.components.find((c) => c.key === "trend")!;

    expect(trend.score).toBe(0.6);
    expect(result.missingInputs).not.toContain("Financial trend");
    // safety = (15+15+15+20 + 15·0.6 + 20)/100 = 0.94 → risk 6
    expect(result.score).toBe(6);
    expect(result.band).toBe("EXCELLENT");
  });

  it("treats non-positive equity as a real signal: leverage 0 and full guarantee penalty", () => {
    const distressed: YearFinancials = {
      ...toEngineYear(WEAK_PROFILE.years[0]),
      totalEquity: D(-1),
    };
    const priorYear = toEngineYear(WEAK_PROFILE.years[1]);
    const years = [priorYear, distressed];
    const result = assessRisk(years, detectRiskFlags(years), WEAK_CONTRACT);
    const byKey = Object.fromEntries(result.components.map((c) => [c.key, c.score]));

    expect(byKey.leverage).toBe(0);
    // exposure = 1 − 0.6 (max guarantee penalty) − 0.3 (2.5× revenue) = 0.1
    expect(byKey.contractExposure).toBeCloseTo(0.1, 6);
    expect(result.missingInputs).not.toContain("Leverage (debt-to-equity)");
  });

  it("never reads absent data as safety: empty year scores only the neutral trend", () => {
    const result = assessRisk([EMPTY_YEAR], [], STRONG_CONTRACT);

    // Every ratio component null; exposure null (equity + revenue missing);
    // only the single-year neutral trend (0.6 × 15) remains.
    expect(result.missingInputs).toHaveLength(5);
    expect(result.score).toBe(40); // (1 − 0.6) × 100
    expect(result.band).toBe("MODERATE");
  });

  it("maps scores to the configured bands at their boundaries", () => {
    expect(riskBandFor(0)).toBe("EXCELLENT");
    expect(riskBandFor(14)).toBe("EXCELLENT");
    expect(riskBandFor(15)).toBe("LOW");
    expect(riskBandFor(34)).toBe("LOW");
    expect(riskBandFor(35)).toBe("MODERATE");
    expect(riskBandFor(54)).toBe("MODERATE");
    expect(riskBandFor(55)).toBe("HIGH");
    expect(riskBandFor(74)).toBe("HIGH");
    expect(riskBandFor(75)).toBe("CRITICAL");
    expect(riskBandFor(100)).toBe("CRITICAL");
  });

  it("is deterministic: identical inputs always produce the identical assessment", () => {
    const { years, flags } = inputs(WEAK_PROFILE.years);
    const first = assessRisk(years, flags, WEAK_CONTRACT);
    const second = assessRisk(years, flags, WEAK_CONTRACT);
    expect(second).toEqual(first);
  });
});
