import { describe, expect, it } from "vitest";

import {
  SYSTEM_PROMPT,
  buildDecisionInput,
  buildUserMessage,
} from "@/services/decision/prompt-builder";

import { strongCompany, strongContract, strongReport } from "../fixtures/decision-case";

const build = () =>
  buildDecisionInput("UC-2026-000001", strongCompany(), strongContract(), strongReport());

describe("decision prompt builder", () => {
  it("sends structured deterministic JSON — money as decimal strings", () => {
    const input = build();

    expect(input.contract.value).toBe("60000000.00");
    expect(input.contract.guaranteeAmount).toBe("6000000.00");
    expect(input.meta.fiscalYears).toEqual([2024, 2025]);
    expect(input.meta.latestFiscalYear).toBe(2025);
    // Ratios reach the model at memo precision — 2dp (current ratio 70/30),
    // so the memo quotes "2.33", never "2.3333".
    expect(input.financialRatios.at(-1)?.liquidity.currentRatio).toBe(2.33);
  });

  it("never includes personal contact data or raw statement rows", () => {
    const message = buildUserMessage(build());

    expect(Object.keys(build().company).sort()).toEqual(["city", "crNumber", "name", "sector"]);
    expect(message).not.toContain("khalid@rawabi.example");
    expect(message).not.toContain("+966500000000");
    expect(message).not.toContain("Khalid Al-Harbi");
    // Raw statement figures (e.g. plain revenue) are not part of the input shape.
    expect(message).not.toContain('"revenue": "120000000.00"');
  });

  it("embeds the deterministic bank-policy recommendation for the risk band", () => {
    const input = build();

    expect(input.riskScore.band).toBe("EXCELLENT");
    expect(input.bankPolicy.policyRecommendation).toBe("APPROVE");
    expect(input.bankPolicy.riskBand).toBe("EXCELLENT");
  });

  it("is deterministic: identical inputs produce byte-identical messages", () => {
    expect(buildUserMessage(build())).toBe(buildUserMessage(build()));
  });

  it("system prompt pins the role, JSON-only output, and no-calculation rules", () => {
    expect(SYSTEM_PROMPT).toContain("Senior Corporate Credit Underwriter");
    expect(SYSTEM_PROMPT).toContain("Alinma Bank");
    expect(SYSTEM_PROMPT).toContain("never make the final decision");
    expect(SYSTEM_PROMPT).toContain("No Markdown");
    expect(SYSTEM_PROMPT).toContain("Never calculate");
    expect(SYSTEM_PROMPT).toContain("Never invent");
  });
});
