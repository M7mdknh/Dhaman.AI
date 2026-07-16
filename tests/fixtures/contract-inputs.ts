/**
 * ContractInputs builder for engine tests. The structured Step-3 fields
 * default to null (a legacy contract) so pre-existing hand-computed
 * expectations stay valid; tests exercising the contract-risk pillar
 * override exactly the fields they need.
 */
import type { ContractInputs } from "@/lib/finance/types";

export function contractInputs(
  base: Pick<
    ContractInputs,
    "contractValue" | "guaranteeAmount" | "beneficiaryType" | "durationMonths"
  >,
  over: Partial<ContractInputs> = {},
): ContractInputs {
  return {
    guaranteePercentage: null,
    sector: null,
    contractorRole: null,
    backToBackPayment: null,
    awardMethod: null,
    priorContractsWithBeneficiary: null,
    advancePaymentPct: null,
    billingCycle: null,
    retentionPct: null,
    paymentPeriodDays: null,
    requiredBondPct: null,
    onFirstDemand: null,
    extendOrPay: null,
    ldRatePctPerWeek: null,
    ldCapPct: null,
    mobilizationWeeks: null,
    expectedGrossMarginPct: null,
    ...base,
    ...over,
  };
}
