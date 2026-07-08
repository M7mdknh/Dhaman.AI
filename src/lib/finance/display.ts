/**
 * Display-only presentation helpers for the Financial Intelligence dashboard.
 *
 * NOT part of the engine: nothing here computes a figure. These map
 * already-computed deterministic scores/bands onto the executive vocabulary
 * (Excellent … Poor) and the shared emerald / amber / red palette so the
 * dashboard reads like banking software instead of a debugging view.
 */
import type {
  CapacityBand,
  RiskBand,
} from "@/lib/finance/types";
import type { RecommendationType } from "@/generated/prisma/client";

export type Tone = "emerald" | "amber" | "red" | "neutral";

/** Outline badge classes per tone — the palette already used across analysis. */
export const BADGE_TONE: Record<Tone, string> = {
  emerald: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  amber: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  red: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
  neutral: "border-border bg-muted text-foreground",
};

/** Solid fill for progress bars per tone. */
export const BAR_TONE: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

/** Foreground text colour per tone (for emphasised figures). */
export const TEXT_TONE: Record<Tone, string> = {
  emerald: "text-emerald-700 dark:text-emerald-400",
  amber: "text-amber-700 dark:text-amber-400",
  red: "text-red-700 dark:text-red-400",
  neutral: "text-foreground",
};

/** Subtle tinted surface + border for the hero verdict card. */
export const SURFACE_TONE: Record<Tone, string> = {
  emerald: "border-emerald-600/25 bg-emerald-600/[0.06]",
  amber: "border-amber-600/25 bg-amber-600/[0.06]",
  red: "border-red-600/25 bg-red-600/[0.06]",
  neutral: "border-border bg-muted/40",
};

export interface Condition {
  label: string;
  tone: Tone;
}

/**
 * Executive condition word from a 0–100 score (higher = healthier). Replaces
 * raw sub-scores like "0.62" with the language a credit committee actually
 * uses.
 */
export function conditionFor(score: number): Condition {
  if (score >= 80) return { label: "Excellent", tone: "emerald" };
  if (score >= 65) return { label: "Strong", tone: "emerald" };
  if (score >= 45) return { label: "Moderate", tone: "amber" };
  if (score >= 25) return { label: "Weak", tone: "red" };
  return { label: "Poor", tone: "red" };
}

/** Same ladder for a 0–1 driver sub-score; null inputs stay neutral. */
export function driverConditionFor(score: number | null): Condition {
  if (score === null) return { label: "No data", tone: "neutral" };
  return conditionFor(Math.round(score * 100));
}

export const CAPACITY_META: Record<CapacityBand, Condition> = {
  STRONG: { label: "Strong capacity", tone: "emerald" },
  MODERATE: { label: "Moderate capacity", tone: "amber" },
  LIMITED: { label: "Limited capacity", tone: "red" },
};

export const RISK_META: Record<RiskBand, Condition> = {
  EXCELLENT: { label: "Excellent", tone: "emerald" },
  LOW: { label: "Low risk", tone: "emerald" },
  MODERATE: { label: "Moderate risk", tone: "amber" },
  HIGH: { label: "High risk", tone: "red" },
  CRITICAL: { label: "Critical risk", tone: "red" },
};

/** Investment-grade colour bucketing for the letter rating. */
export function ratingTone(rating: string): Tone {
  if (["AAA", "AA", "A"].includes(rating)) return "emerald";
  if (["BBB", "BB"].includes(rating)) return "amber";
  return "red";
}

export interface Verdict {
  /** Plain-language answer to "Can the bank issue this guarantee?". */
  answer: string;
  tone: Tone;
}

/** The headline verdict tone + answer, derived from bank-policy recommendation. */
export const VERDICT_META: Record<RecommendationType, Verdict> = {
  APPROVE: { answer: "Yes — eligible for issuance", tone: "emerald" },
  APPROVE_WITH_CONDITIONS: { answer: "Yes — subject to conditions", tone: "amber" },
  MANUAL_REVIEW: { answer: "Manual review required", tone: "neutral" },
  REJECT: { answer: "Not at this time", tone: "red" },
};
