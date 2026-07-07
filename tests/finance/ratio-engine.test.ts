import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { computeGrowth, computeRatios, computeYearRatios } from "@/services/finance/financial-ratio-service";

import { STRONG_PROFILE, WEAK_PROFILE } from "../fixtures/company-profiles";
import { EMPTY_YEAR, toEngineYear } from "../fixtures/year-financials";

const strong2025 = toEngineYear(STRONG_PROFILE.years[0]);
const weak2025 = toEngineYear(WEAK_PROFILE.years[0]);

describe("ratio engine — strong profile FY2025 (hand-computed)", () => {
  const { ratios, workingCapital, freeCashFlow } = computeYearRatios(strong2025);

  it("liquidity", () => {
    expect(ratios.currentRatio).toBe(2.3333); // 70M / 30M
    expect(ratios.quickRatio).toBe(1.8333); // (70M − 15M) / 30M
    expect(ratios.cashRatio).toBe(0.8333); // 25M / 30M
    expect(workingCapital).toBe("40000000.00"); // 70M − 30M
  });

  it("leverage", () => {
    expect(ratios.debtRatio).toBe(0.375); // 45M / 120M
    expect(ratios.debtToEquity).toBe(0.6); // 45M / 75M
    expect(ratios.debtToAssets).toBe(0.1667); // (5M + 15M) / 120M — derived total debt
    expect(ratios.interestCoverage).toBe(9); // 18M / 2M
  });

  it("profitability", () => {
    expect(ratios.grossMargin).toBe(0.3); // 36M / 120M
    expect(ratios.operatingMargin).toBe(0.15);
    expect(ratios.netMargin).toBe(0.1167);
    expect(ratios.returnOnAssets).toBe(0.1167);
    expect(ratios.returnOnEquity).toBe(0.1867); // 14M / 75M
    expect(ratios.ebitdaMargin).toBeNull(); // EBITDA not printed — never derived
  });

  it("efficiency, cash flow, coverage", () => {
    expect(ratios.assetTurnover).toBe(1); // 120M / 120M
    expect(ratios.inventoryTurnover).toBe(5.6); // 84M / 15M
    expect(ratios.receivableTurnover).toBe(4); // 120M / 30M
    expect(ratios.operatingCashFlowRatio).toBe(0.6667); // 20M / 30M
    expect(freeCashFlow).toBe("12000000.00"); // 20M − 8M
    expect(ratios.dscr).toBeNull(); // needs EBITDA
    expect(ratios.ebitdaCoverage).toBeNull();
  });
});

describe("ratio engine — validation & graceful degradation", () => {
  it("returns null for every ratio on an empty year (no NaN, no throw)", () => {
    const { ratios, workingCapital, freeCashFlow } = computeYearRatios(EMPTY_YEAR);
    for (const value of Object.values(ratios)) expect(value).toBeNull();
    expect(workingCapital).toBeNull();
    expect(freeCashFlow).toBeNull();
  });

  it("nulls equity-based ratios when equity is non-positive", () => {
    const negativeEquity = { ...weak2025, totalEquity: new Prisma.Decimal(-1_000_000) };
    const { ratios } = computeYearRatios(negativeEquity);
    expect(ratios.debtToEquity).toBeNull();
    expect(ratios.returnOnEquity).toBeNull();
    expect(ratios.currentRatio).not.toBeNull(); // others unaffected
  });

  it("handles zero denominators", () => {
    const zeroCl = { ...strong2025, currentLiabilities: new Prisma.Decimal(0) };
    expect(computeYearRatios(zeroCl).ratios.currentRatio).toBeNull();
  });

  it("negative working capital is preserved, not clamped", () => {
    expect(computeYearRatios(weak2025).workingCapital).toBe("-3000000.00"); // 25M − 28M
  });
});

describe("growth engine", () => {
  it("computes YoY growth for the strong profile (hand-computed)", () => {
    const [period] = computeGrowth(STRONG_PROFILE.years.map(toEngineYear));
    expect(period.fromYear).toBe(2024);
    expect(period.toYear).toBe(2025);
    expect(period.growth.revenueGrowth).toBe(0.2); // 100M → 120M
    expect(period.growth.assetGrowth).toBe(0.1429); // 105M → 120M
    expect(period.growth.equityGrowth).toBe(0.3158); // 57M → 75M
    expect(period.growth.cashGrowth).toBe(0.3889); // 18M → 25M
    expect(period.growth.netIncomeGrowth).toBe(0.3333); // 10.5M → 14M
  });

  it("returns null growth against a non-positive prior (weak net income)", () => {
    const years = WEAK_PROFILE.years.map(toEngineYear);
    // Make the PRIOR year's net income negative to exercise the base rule.
    years[1] = { ...years[1], netIncome: new Prisma.Decimal(-500_000) };
    const [period] = computeGrowth(years);
    expect(period.growth.netIncomeGrowth).toBeNull();
  });

  it("yields no periods for a single year", () => {
    expect(computeGrowth([strong2025])).toEqual([]);
  });

  it("computeRatios sorts years ascending regardless of input order", () => {
    const out = computeRatios(STRONG_PROFILE.years.map(toEngineYear)); // input newest-first
    expect(out.map((y) => y.fiscalYear)).toEqual([2024, 2025]);
  });
});
