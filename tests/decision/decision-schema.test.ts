import { describe, expect, it } from "vitest";

import { decisionResponseSchema } from "@/lib/validation/decision";
import { parseDecisionResponse } from "@/services/decision/decision-intelligence-service";

const valid = {
  summary: "A strong contractor requesting a performance guarantee.",
  companyStrengths: ["Liquidity is comfortable at a current ratio of 2.33."],
  companyWeaknesses: ["EBITDA is not printed in the statements."],
  contractAssessment: "The contract is 0.50× annual revenue — well within capacity.",
  riskExplanation: "No risk flags were raised by the deterministic engines.",
  recommendation: "APPROVE",
  recommendationReason: "Bank policy maps the EXCELLENT risk band to Approve.",
  missingInformation: ["Audited EBITDA figures."],
  confidenceExplanation: "All engine inputs were available.",
  nextSteps: ["Risk Officer review of the underwriting package."],
};

describe("decision response validation", () => {
  it("accepts a complete, well-formed response", () => {
    expect(decisionResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing field", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.summary;
    expect(decisionResponseSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects unknown extra fields (strict contract)", () => {
    expect(decisionResponseSchema.safeParse({ ...valid, calculatedRatio: 1.2 }).success).toBe(false);
  });

  it("rejects an invented recommendation value", () => {
    expect(decisionResponseSchema.safeParse({ ...valid, recommendation: "DECLINE" }).success).toBe(false);
  });

  it("rejects empty lists and empty strings", () => {
    expect(decisionResponseSchema.safeParse({ ...valid, nextSteps: [] }).success).toBe(false);
    expect(decisionResponseSchema.safeParse({ ...valid, summary: "  " }).success).toBe(false);
  });

  it("parseDecisionResponse tolerates fenced JSON but rejects garbage", () => {
    expect(parseDecisionResponse(JSON.stringify(valid))).not.toBeNull();
    expect(parseDecisionResponse("```json\n" + JSON.stringify(valid) + "\n```")).not.toBeNull();
    expect(parseDecisionResponse("The company looks fine to me.")).toBeNull();
    expect(parseDecisionResponse('{"summary": "only a summary"}')).toBeNull();
  });
});
