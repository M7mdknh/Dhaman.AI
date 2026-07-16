/**
 * Contract-risk pillar — hand-computed expectations against the
 * CONTRACT_RISK thresholds, the jump-risk hard cap, and the structure
 * flags (cash gap, thin margin, margin optimism, bond terms, consistency).
 */
import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  assessContractRisk,
  burnWindowMonths,
  cashGapCoverage,
  detectContractCaps,
  detectContractRiskFlags,
  jumpRatio,
} from "@/services/finance/contract-risk-service";

import { contractInputs } from "../fixtures/contract-inputs";
import { qualitativeInputs } from "../fixtures/qualitative-inputs";
import { EMPTY_YEAR } from "../fixtures/year-financials";

import type { ContractInputs } from "@/lib/finance/types";

const D = (n: number) => new Prisma.Decimal(n);

/** A well-structured main-contract award (every field declared). */
function structured(over: Partial<ContractInputs> = {}): ContractInputs {
  return contractInputs(
    {
      contractValue: D(60_000_000),
      guaranteeAmount: D(6_000_000),
      beneficiaryType: "GOVERNMENT",
      durationMonths: 24,
    },
    {
      guaranteePercentage: 10,
      sector: "Infrastructure",
      contractorRole: "MAIN_CONTRACTOR",
      backToBackPayment: null,
      awardMethod: "LIMITED_TENDER",
      priorContractsWithBeneficiary: 4,
      advancePaymentPct: 10,
      billingCycle: "MONTHLY",
      retentionPct: 5,
      paymentPeriodDays: 60,
      requiredBondPct: 10,
      onFirstDemand: true,
      extendOrPay: false,
      ldRatePctPerWeek: 0.5,
      ldCapPct: 10,
      mobilizationWeeks: 8,
      expectedGrossMarginPct: 18,
      ...over,
    },
  );
}

describe("contract risk engine (hand-computed)", () => {
  it("scores the well-structured repeat award as LOW risk", () => {
    // jump 60/80=0.75×→1×20 · main→1×12 · 4 prior→1×10 ·
    // cash gap: burn = 8/4.345 + 1 + 2 = 4.8412mo; coverage = 10×24/(100×4.8412)
    //   = 0.4957 → ×18 = 8.9234 · margin 18%→0.8×12=9.6 · realism excluded
    // (no history) · limited tender→1×6 · first-demand→0.56×9=5.04 · LD cap
    // 10%→1×5 ⇒ safety 76.5634/92 = 0.83221 ⇒ score 17.
    const result = assessContractRisk(structured(), qualitativeInputs(), null);
    expect(result.score).toBe(17);
    expect(result.band).toBe("LOW");
    expect(result.missingInputs).toEqual(["Margin realism vs audited history (computed)"]);
  });

  it("treats a legacy contract (no structured fields) as mostly missing inputs", () => {
    const legacy = contractInputs({
      contractValue: D(60_000_000),
      guaranteeAmount: D(6_000_000),
      beneficiaryType: "GOVERNMENT",
      durationMonths: 24,
    });
    const result = assessContractRisk(legacy, null, null);
    expect(result.missingInputs.length).toBeGreaterThanOrEqual(8);
  });

  it("computes the jump ratio, treating a zero track record as infinite", () => {
    expect(jumpRatio(structured(), qualitativeInputs())).toBeCloseTo(0.75, 5);
    expect(
      jumpRatio(structured(), qualitativeInputs({ largestProjectValue: D(0) })),
    ).toBe(Number.POSITIVE_INFINITY);
    expect(jumpRatio(structured(), null)).toBeNull();
  });

  it("computes the burn window and advance coverage", () => {
    const contract = structured();
    expect(burnWindowMonths(contract)).toBeCloseTo(8 / 4.345 + 1 + 2, 4);
    expect(cashGapCoverage(contract)).toBeCloseTo(0.49575, 4);
    expect(cashGapCoverage({ ...contract, mobilizationWeeks: null })).toBeNull();
  });
});

describe("contract hard caps", () => {
  it("caps a >3× scale jump at approve-with-conditions", () => {
    const caps = detectContractCaps(
      structured(),
      qualitativeInputs({ largestProjectValue: D(10_000_000) }), // 6×
    );
    expect(caps).toHaveLength(1);
    expect(caps[0].type).toBe("JUMP_RISK");
    expect(caps[0].ceiling).toBe("APPROVE_WITH_CONDITIONS");
  });

  it("raises no cap within the proven scale", () => {
    expect(detectContractCaps(structured(), qualitativeInputs())).toEqual([]);
  });
});

describe("contract risk flags", () => {
  it("flags the cash gap when the advance covers under half the burn window", () => {
    const flags = detectContractRiskFlags(
      structured({ advancePaymentPct: 5 }), // coverage ≈ 0.248
      qualitativeInputs(),
      null,
    );
    expect(flags.some((f) => f.type === "CASH_GAP")).toBe(true);
  });

  it("flags thin margins and bond tail risk", () => {
    const flags = detectContractRiskFlags(
      structured({ expectedGrossMarginPct: 7, extendOrPay: true }),
      qualitativeInputs(),
      null,
    );
    expect(flags.some((f) => f.type === "THIN_MARGIN")).toBe(true);
    expect(flags.some((f) => f.type === "BOND_TAIL_RISK")).toBe(true);
  });

  it("flags margin optimism against the audited gross-margin history", () => {
    // Historical gross margin 10% (6M / 60M); declared 18% ⇒ 1.8× > 1.5×.
    const latest = { ...EMPTY_YEAR, revenue: D(60_000_000), grossProfit: D(6_000_000) };
    const flags = detectContractRiskFlags(structured(), qualitativeInputs(), latest);
    expect(flags.some((f) => f.type === "MARGIN_OPTIMISM")).toBe(true);
  });

  it("flags a bond percentage that does not match the contract's requirement", () => {
    const flags = detectContractRiskFlags(
      structured({ requiredBondPct: 5 }), // guarantee is 10%
      qualitativeInputs(),
      null,
    );
    const mismatch = flags.find((f) => f.type === "BOND_PERCENTAGE_MISMATCH");
    expect(mismatch?.severity).toBe("MEDIUM");
  });

  it("flags back-to-back subcontracting", () => {
    const flags = detectContractRiskFlags(
      structured({ contractorRole: "SUBCONTRACTOR", backToBackPayment: true }),
      qualitativeInputs(),
      null,
    );
    expect(flags.some((f) => f.type === "BACK_TO_BACK_PAYMENT")).toBe(true);
  });
});
