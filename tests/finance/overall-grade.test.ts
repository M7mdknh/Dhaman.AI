/**
 * Composite grade — pillar weighting (50/30/20), renormalization when a
 * pillar is absent (legacy cases must grade exactly as before), hard-cap
 * application to the recommendation, and statement-reliability confidence.
 */
import { describe, expect, it } from "vitest";

import { composeOverallGrade } from "@/services/finance/overall-grade-service";

import type { HardCap, PillarAssessment, RiskAssessment } from "@/lib/finance/types";

const pillar = (score: number): PillarAssessment & RiskAssessment => ({
  score,
  band: "LOW",
  components: [],
  missingInputs: [],
});

describe("composeOverallGrade", () => {
  it("weights the three pillars 50/30/20", () => {
    const grade = composeOverallGrade(pillar(20), pillar(3), pillar(17), [], ["AUDITED"]);
    // (20×50 + 3×30 + 17×20) / 100 = 14.3 → 14 → EXCELLENT → APPROVE.
    expect(grade.score).toBe(14);
    expect(grade.band).toBe("EXCELLENT");
    expect(grade.recommendation).toBe("APPROVE");
  });

  it("renormalizes to the financial pillar alone on a legacy case", () => {
    const grade = composeOverallGrade(pillar(42), null, null, [], ["AUDITED"]);
    expect(grade.score).toBe(42);
    expect(grade.band).toBe("MODERATE");
    expect(grade.recommendation).toBe("APPROVE_WITH_CONDITIONS");
  });

  it("applies hard caps to the recommendation without touching the score", () => {
    const cap: HardCap = {
      type: "GUARANTEE_PREVIOUSLY_CALLED",
      ceiling: "MANUAL_REVIEW",
      reason: "A guarantee was called before.",
    };
    const grade = composeOverallGrade(pillar(10), pillar(5), pillar(8), [cap], ["AUDITED"]);
    expect(grade.band).toBe("EXCELLENT"); // score untouched
    expect(grade.uncappedRecommendation).toBe("APPROVE");
    expect(grade.recommendation).toBe("MANUAL_REVIEW");
    expect(grade.caps).toEqual([cap]);
  });

  it("never lets a cap improve a recommendation already less favorable", () => {
    const cap: HardCap = {
      type: "JUMP_RISK",
      ceiling: "APPROVE_WITH_CONDITIONS",
      reason: "Scale jump.",
    };
    const grade = composeOverallGrade(pillar(80), null, null, [cap], ["AUDITED"]);
    expect(grade.recommendation).toBe("REJECT"); // CRITICAL band wins
  });

  it("bounds confidence by the WEAKEST statement in the window", () => {
    expect(composeOverallGrade(pillar(10), null, null, [], ["AUDITED"]).confidence).toBe("HIGH");
    expect(
      composeOverallGrade(pillar(10), null, null, [], ["AUDITED", "REVIEWED"]).confidence,
    ).toBe("MEDIUM");
    expect(
      composeOverallGrade(pillar(10), null, null, [], ["AUDITED", "MANAGEMENT"]).confidence,
    ).toBe("LOW");
  });
});
