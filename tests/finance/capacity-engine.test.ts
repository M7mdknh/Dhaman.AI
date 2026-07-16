import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { assessExecutionCapacity } from "@/services/finance/execution-capacity-service";

import { STRONG_PROFILE, WEAK_PROFILE } from "../fixtures/company-profiles";
import { contractInputs } from "../fixtures/contract-inputs";
import { EMPTY_YEAR, toEngineYear } from "../fixtures/year-financials";

const D = (n: number) => new Prisma.Decimal(n);

const STRONG_CONTRACT = contractInputs({
  contractValue: D(60_000_000),
  guaranteeAmount: D(6_000_000),
  beneficiaryType: "GOVERNMENT",
  durationMonths: 24,
});

const WEAK_CONTRACT = contractInputs({
  contractValue: D(75_000_000),
  guaranteeAmount: D(7_500_000),
  beneficiaryType: "PRIVATE",
  durationMonths: 36,
});

describe("execution capacity engine (hand-computed)", () => {
  it("scores the strong profile + comfortable government contract at 95/STRONG", () => {
    const result = assessExecutionCapacity(toEngineYear(STRONG_PROFILE.years[0]), STRONG_CONTRACT);
    // 50 (all health components at 1.0) + 18×1 + 8×0.8333 + 6×1 + 8×0.7333 + 10×0.8 = 94.53
    expect(result.score).toBe(95);
    expect(result.band).toBe("STRONG");
    expect(result.missingInputs).toEqual([]);

    const byKey = Object.fromEntries(result.components.map((c) => [c.key, c.score]));
    expect(byKey.liquidity).toBe(1); // CR 2.33 ≥ 2.0
    expect(byKey.contractVsRevenue).toBe(1); // 0.5× revenue
    expect(byKey.contractVsAssets).toBeCloseTo(0.8333, 3); // 0.5× assets
    expect(byKey.duration).toBeCloseTo(0.7333, 3); // 24 months
    expect(byKey.beneficiary).toBe(0.8); // government
  });

  it("scores the weak profile + oversized private contract at 13/LIMITED", () => {
    const result = assessExecutionCapacity(toEngineYear(WEAK_PROFILE.years[0]), WEAK_CONTRACT);
    // Health components all 0; 8×0.2083 + 6×0.5 + 8×0.4667 + 10×0.5 = 13.4
    expect(result.score).toBe(13);
    expect(result.band).toBe("LIMITED");

    const byKey = Object.fromEntries(result.components.map((c) => [c.key, c.score]));
    expect(byKey.liquidity).toBe(0); // CR 0.89
    expect(byKey.leverage).toBe(0); // D/E 4.0
    expect(byKey.profitability).toBe(0); // negative margin
    expect(byKey.cashFlow).toBe(0); // negative OCF
    expect(byKey.workingCapital).toBe(0); // negative WC
    expect(byKey.contractVsRevenue).toBe(0); // 2.5× revenue
    expect(byKey.guaranteeVsEquity).toBeCloseTo(0.5, 3); // 0.625× equity
  });

  it("excludes missing components and renormalizes the weights", () => {
    const result = assessExecutionCapacity(EMPTY_YEAR, STRONG_CONTRACT);
    // Only duration (0.7333) and beneficiary (0.8) are computable:
    // (8×0.7333 + 10×0.8) / 18 = 0.7704 → 77
    expect(result.missingInputs.length).toBe(8);
    expect(result.score).toBe(77);
    // The completeness gap is visible to the officer, not hidden in the score.
    expect(result.components.filter((c) => c.score === null).length).toBe(8);
  });

  it("treats non-positive equity as a real zero, not missing data", () => {
    const year = { ...toEngineYear(WEAK_PROFILE.years[0]), totalEquity: D(-1) };
    const result = assessExecutionCapacity(year, WEAK_CONTRACT);
    const leverage = result.components.find((c) => c.key === "leverage")!;
    const guarantee = result.components.find((c) => c.key === "guaranteeVsEquity")!;
    expect(leverage.score).toBe(0);
    expect(guarantee.score).toBe(0);
    expect(result.missingInputs).not.toContain(leverage.label);
  });

  it("handles missing duration gracefully", () => {
    const result = assessExecutionCapacity(toEngineYear(STRONG_PROFILE.years[0]), {
      ...STRONG_CONTRACT,
      durationMonths: null,
    });
    expect(result.missingInputs).toContain("Contract duration");
    expect(result.score).toBeGreaterThan(0);
  });
});
