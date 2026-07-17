/**
 * Contract-risk pillar — hand-computed expectations against the
 * CONTRACT_RISK thresholds and the structure flags (cash gap, thin margin,
 * margin optimism, bond terms, consistency).
 */
import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  assessContractRisk,
  burnWindowMonths,
  cashGapCoverage,
  detectContractRiskFlags,
} from "@/services/finance/contract-risk-service";

import { contractInputs } from "../fixtures/contract-inputs";
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
    // main→1×15 · 4 prior→1×13 ·
    // cash gap: burn = 8/4.345 + 1 + 2 = 4.8412mo; coverage = 10×24/(100×4.8412)
    //   = 0.4957 → ×22 = 10.9064 · margin 18%→0.8×15=12 · realism excluded
    // (no history) · limited tender→1×8 · first-demand→0.56×11=6.16 · LD cap
    // 10%→1×6 ⇒ safety 71.0664/90 = 0.78963 ⇒ score 21.
    const result = assessContractRisk(structured(), null);
    expect(result.score).toBe(21);
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
    const result = assessContractRisk(legacy, null);
    expect(result.missingInputs.length).toBe(8);
  });

  it("computes the burn window and advance coverage", () => {
    const contract = structured();
    expect(burnWindowMonths(contract)).toBeCloseTo(8 / 4.345 + 1 + 2, 4);
    expect(cashGapCoverage(contract)).toBeCloseTo(0.49575, 4);
    expect(cashGapCoverage({ ...contract, mobilizationWeeks: null })).toBeNull();
  });
});

describe("contract risk flags", () => {
  it("flags the cash gap when the advance covers under half the burn window", () => {
    const flags = detectContractRiskFlags(
      structured({ advancePaymentPct: 5 }), // coverage ≈ 0.248
      null,
    );
    expect(flags.some((f) => f.type === "CASH_GAP")).toBe(true);
  });

  it("flags thin margins and bond tail risk", () => {
    const flags = detectContractRiskFlags(
      structured({ expectedGrossMarginPct: 7, extendOrPay: true }),
      null,
    );
    expect(flags.some((f) => f.type === "THIN_MARGIN")).toBe(true);
    expect(flags.some((f) => f.type === "BOND_TAIL_RISK")).toBe(true);
  });

  it("flags margin optimism against the audited gross-margin history", () => {
    // Historical gross margin 10% (6M / 60M); declared 18% ⇒ 1.8× > 1.5×.
    const latest = { ...EMPTY_YEAR, revenue: D(60_000_000), grossProfit: D(6_000_000) };
    const flags = detectContractRiskFlags(structured(), latest);
    expect(flags.some((f) => f.type === "MARGIN_OPTIMISM")).toBe(true);
  });

  it("flags a bond percentage that does not match the contract's requirement", () => {
    const flags = detectContractRiskFlags(
      structured({ requiredBondPct: 5 }), // guarantee is 10%
      null,
    );
    const mismatch = flags.find((f) => f.type === "BOND_PERCENTAGE_MISMATCH");
    expect(mismatch?.severity).toBe("MEDIUM");
  });

  it("flags back-to-back subcontracting", () => {
    const flags = detectContractRiskFlags(
      structured({ contractorRole: "SUBCONTRACTOR", backToBackPayment: true }),
      null,
    );
    expect(flags.some((f) => f.type === "BACK_TO_BACK_PAYMENT")).toBe(true);
  });
});
