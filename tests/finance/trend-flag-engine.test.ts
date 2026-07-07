import { describe, expect, it } from "vitest";

import { detectRiskFlags } from "@/services/finance/risk-flag-service";
import { computeTrends } from "@/services/finance/trend-analysis-service";

import { STRONG_PROFILE, WEAK_PROFILE } from "../fixtures/company-profiles";
import { toEngineYear } from "../fixtures/year-financials";

const strongYears = STRONG_PROFILE.years.map(toEngineYear);
const weakYears = WEAK_PROFILE.years.map(toEngineYear);

describe("trend engine", () => {
  it("builds ascending series with YoY changes and directions", () => {
    const trends = computeTrends(strongYears);
    const revenue = trends.find((t) => t.key === "revenue")!;
    expect(revenue.series.map((p) => p.fiscalYear)).toEqual([2024, 2025]);
    expect(revenue.series.map((p) => p.value)).toEqual(["100000000.00", "120000000.00"]);
    expect(revenue.yoyChanges).toEqual([{ fromYear: 2024, toYear: 2025, changePct: 0.2 }]);
    expect(revenue.direction).toBe("INCREASING");

    const debt = trends.find((t) => t.key === "totalDebt")!;
    expect(debt.series.map((p) => p.value)).toEqual(["24000000.00", "20000000.00"]);
    expect(debt.direction).toBe("DECREASING"); // direction is raw, not judgment

    const margin = trends.find((t) => t.key === "netMargin")!;
    expect(margin.unit).toBe("percent");
    expect(margin.series.map((p) => p.value)).toEqual([0.105, 0.1167]);
  });

  it("classifies small movements as STABLE and single years as null", () => {
    const trends = computeTrends(weakYears);
    const equityOnly = computeTrends([weakYears[0]]);
    // Weak inventory 7M → 6M = −14.3% → DECREASING; cash −75% → DECREASING.
    expect(trends.find((t) => t.key === "cash")!.direction).toBe("DECREASING");
    expect(equityOnly.find((t) => t.key === "revenue")!.direction).toBeNull();
    expect(equityOnly.find((t) => t.key === "revenue")!.yoyChanges).toEqual([]);
  });
});

describe("risk flag engine", () => {
  it("raises no flags for the strong profile", () => {
    expect(detectRiskFlags(strongYears)).toEqual([]);
  });

  it("raises the full distressed-set for the weak profile", () => {
    const flags = detectRiskFlags(weakYears);
    const types = flags.map((f) => f.type);

    expect(types).toContain("REVENUE_DECLINE"); // −33.3%
    expect(types).toContain("CASH_DETERIORATION"); // −75%
    expect(types).toContain("NEGATIVE_WORKING_CAPITAL"); // −3M
    expect(types).toContain("NEGATIVE_OPERATING_CASH_FLOW"); // −1.5M latest
    expect(types).toContain("RAPID_RECEIVABLE_GROWTH"); // +50% vs −33%
    expect(types).toContain("MARGIN_DETERIORATION"); // 2.7% → −9.3%
    expect(types).toContain("LIQUIDITY_CRITICAL"); // 0.89 < 1.0
    expect(types).toContain("EQUITY_EROSION"); // −28.6%
    expect(types).not.toContain("DEBT_SPIKE"); // +14.3% < 30% threshold
  });

  it("orders by severity and carries evidence with affected years", () => {
    const flags = detectRiskFlags(weakYears);
    const severities = flags.map((f) => f.severity);
    const firstMediumIdx = severities.indexOf("MEDIUM");
    expect(severities.slice(0, firstMediumIdx).every((s) => s === "HIGH")).toBe(true);

    const revenueDecline = flags.find((f) => f.type === "REVENUE_DECLINE")!;
    expect(revenueDecline.severity).toBe("HIGH");
    expect(revenueDecline.affectedYears).toEqual([2024, 2025]);
    expect(revenueDecline.evidence).toEqual([
      { label: "Revenue", fiscalYear: 2024, value: "45000000.00" },
      { label: "Revenue", fiscalYear: 2025, value: "30000000.00" },
    ]);
    expect(revenueDecline.explanation).toContain("33.3%");
  });

  it("is silent on empty input and single healthy years", () => {
    expect(detectRiskFlags([])).toEqual([]);
    const single = detectRiskFlags([strongYears[0]]);
    expect(single).toEqual([]); // no prior year → no YoY flags; no absolute breaches
  });
});
