import { describe, expect, it } from "vitest";

import { deriveHeadline, deriveRating } from "@/lib/finance/headline";
import { composeOverallGrade } from "@/services/finance/overall-grade-service";

import type { FinancialIntelligenceReport } from "@/lib/finance/types";

/** Minimal report carrying only the fields the headline reads. With no
 * qualitative/contract pillars the composite grade renormalizes to the
 * financial risk score alone — exactly the legacy behavior under test. */
function report(overrides: {
  riskScore: number;
  riskBand: FinancialIntelligenceReport["risk"]["band"];
  capacity?: { score: number; band: "STRONG" | "MODERATE" | "LIMITED" } | null;
}): FinancialIntelligenceReport {
  const risk = {
    score: overrides.riskScore,
    band: overrides.riskBand,
    components: [],
    missingInputs: [],
  };
  return {
    years: [2024, 2025],
    latestYear: 2025,
    currency: "SAR",
    disclosures: { orderOfLiquidity: false },
    ratiosByYear: [],
    growthPeriods: [],
    trends: [],
    flags: [],
    risk,
    capacity:
      overrides.capacity === undefined
        ? { score: 72, band: "MODERATE", components: [], missingInputs: [] }
        : overrides.capacity
          ? { ...overrides.capacity, components: [], missingInputs: [] }
          : null,
    qualitative: null,
    contractRisk: null,
    overall: composeOverallGrade(risk, null, null, [], ["AUDITED", "AUDITED"]),
  };
}

describe("deriveRating", () => {
  it("maps risk score (0 = safest) to a letter grade", () => {
    expect(deriveRating(5)).toBe("AAA");
    expect(deriveRating(12)).toBe("AA");
    expect(deriveRating(24)).toBe("A");
    expect(deriveRating(40)).toBe("BBB");
    expect(deriveRating(55)).toBe("BB");
    expect(deriveRating(70)).toBe("B");
    expect(deriveRating(90)).toBe("CCC");
  });
});

describe("deriveHeadline", () => {
  it("derives capacity, rating, health, risk, and the policy recommendation", () => {
    const h = deriveHeadline(report({ riskScore: 10, riskBand: "LOW", capacity: { score: 80, band: "STRONG" } }));
    expect(h.capacityScore).toBe(80);
    expect(h.capacityBand).toBe("STRONG");
    expect(h.rating).toBe("AA"); // 10 < 16
    expect(h.healthScore).toBe(90); // 100 - 10
    expect(h.riskScore).toBe(10);
    // The composite grade re-derives the band from the score (10 < 15 ⇒
    // EXCELLENT) — it never trusts a caller-supplied band.
    expect(h.riskBand).toBe("EXCELLENT");
    expect(h.recommendation).toBe("APPROVE");
  });

  it("uses bank policy for the recommendation and clamps health", () => {
    const h = deriveHeadline(report({ riskScore: 95, riskBand: "CRITICAL", capacity: null }));
    expect(h.recommendation).toBe("REJECT");
    expect(h.capacityScore).toBeNull();
    expect(h.healthScore).toBe(5);
    expect(h.rating).toBe("CCC");
  });

  it("maps MODERATE risk to approve-with-conditions", () => {
    const h = deriveHeadline(report({ riskScore: 45, riskBand: "MODERATE" }));
    expect(h.recommendation).toBe("APPROVE_WITH_CONDITIONS");
  });
});
