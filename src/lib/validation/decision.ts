/**
 * Zod contract for the Decision Intelligence model response. EVERYTHING the
 * model returns passes through this schema before persistence or display —
 * an invalid response is rejected (and retried), never patched up.
 */
import { z } from "zod";

export const RECOMMENDATIONS = [
  "APPROVE",
  "APPROVE_WITH_CONDITIONS",
  "MANUAL_REVIEW",
  "REJECT",
] as const;

export type Recommendation = (typeof RECOMMENDATIONS)[number];

const text = z.string().trim().min(1).max(4000);
const textList = z.array(text).min(1).max(20);

export const decisionResponseSchema = z
  .object({
    summary: text,
    companyStrengths: textList,
    companyWeaknesses: textList,
    contractAssessment: text,
    riskExplanation: text,
    recommendation: z.enum(RECOMMENDATIONS),
    recommendationReason: text,
    missingInformation: textList,
    confidenceExplanation: text,
    nextSteps: textList,
  })
  .strict();

export type DecisionResponse = z.infer<typeof decisionResponseSchema>;
