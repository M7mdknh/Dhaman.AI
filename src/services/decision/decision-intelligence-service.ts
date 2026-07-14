/**
 * DecisionIntelligenceService — the pipeline between the deterministic
 * Financial Intelligence Engine and the LLM provider:
 *
 *   guard → build engine report → build structured input → cache lookup
 *   → provider call (with retries) → zod validation → policy cross-check
 *   → persist (frozen snapshot + memo) → audit
 *
 * The UI never sees provider logic: it calls this service and renders rows.
 * Only VALIDATED responses are persisted; every failure is audited.
 * The recommendation OF RECORD is bank policy (risk band mapping) — a
 * diverging model recommendation is stored for transparency and flagged,
 * never adopted.
 */
import { createHash } from "node:crypto";

import { getLLMProvider } from "@/lib/ai";
import { LLMProviderError, type LLMProvider } from "@/lib/ai/provider";
import { env } from "@/lib/env";
import { RECOMMENDATION_BY_BAND } from "@/lib/finance/thresholds";
import { prisma } from "@/lib/prisma";
import { decisionResponseSchema, type DecisionResponse } from "@/lib/validation/decision";
import { recordAudit } from "@/services/audit-service";
import { getBankUser } from "@/services/officer-case-service";
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildDecisionInput,
  buildUserMessage,
} from "@/services/decision/prompt-builder";
import {
  buildFinancialIntelligence,
  toIdentityInputs,
} from "@/services/finance/financial-intelligence-service";

import type { DecisionIntelligence, Prisma } from "@/generated/prisma/client";

const MAX_ATTEMPTS = 3; // 1 call + 2 retries on retryable failures
const BACKOFF_MS = [1_000, 3_000];
const MAX_OUTPUT_TOKENS = 1_600;
const TEMPERATURE = 0.2;

type DecisionResult =
  | { ok: true; decision: DecisionIntelligence; cached: boolean }
  | { ok: false; error: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Cache key: identical input + prompt + provider + model ⇒ no repeat call. */
function computeInputHash(userMessage: string, provider: LLMProvider): string {
  return createHash("sha256")
    .update(userMessage)
    .update(`\n${PROMPT_VERSION}|${provider.name}|${provider.model}`)
    .digest("hex");
}

/**
 * Defensive extraction: providers are asked for bare JSON, but a fenced or
 * prefixed response must not crash parsing — anything that still fails zod
 * is rejected as invalid.
 */
export function parseDecisionResponse(text: string): DecisionResponse | null {
  const trimmed = text.trim();
  const candidate =
    trimmed.startsWith("{")
      ? trimmed
      : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  try {
    const parsed = decisionResponseSchema.safeParse(JSON.parse(candidate));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Provider call + validation with retries: retryable failures and invalid
 * responses get MAX_ATTEMPTS tries with backoff; non-retryable errors (AUTH)
 * abort immediately. Throws the last error when no attempt produced a
 * schema-valid response. Pure over the provider — unit-tested with fakes.
 */
export async function requestValidatedDecision(
  provider: LLMProvider,
  userMessage: string,
  backoffMs: readonly number[] = BACKOFF_MS,
): Promise<DecisionResponse> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await provider.completeJSON({
        system: SYSTEM_PROMPT,
        user: userMessage,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
        timeoutMs: env.LLM_TIMEOUT_MS,
      });
      const response = parseDecisionResponse(result.text);
      if (response) return response;
      // Syntactically or structurally invalid — rejected, retried like a failure.
      lastError = new LLMProviderError("BAD_RESPONSE", "Model response failed schema validation");
    } catch (error) {
      lastError = error;
      if (error instanceof LLMProviderError && !error.retryable) break;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(backoffMs[attempt - 1] ?? 0);
  }

  throw lastError ?? new LLMProviderError("BAD_RESPONSE", "No response from the provider");
}

function userFacingError(error: unknown): string {
  if (error instanceof LLMProviderError) {
    switch (error.kind) {
      case "AUTH":
        return "The AI provider rejected the configured API key. Ask an administrator to verify OPENAI_API_KEY.";
      case "RATE_LIMIT":
        return "The AI provider is currently rate-limiting requests. Please try again in a minute.";
      case "TIMEOUT":
      case "NETWORK":
        return "The AI provider could not be reached. Please try again.";
      case "BAD_RESPONSE":
        return "The AI provider returned an unusable response. Please try again.";
    }
  }
  return "Decision intelligence could not be generated. Please try again.";
}

/**
 * Bank-triggered generation (or cache reuse) of the underwriting memo.
 * Bank-staff-only since Sprint 5 — the memo is a bank-internal work product
 * (see docs/UNDERWRITING_WORKSPACE.md); contractors never trigger or read it.
 * Delegates to the guard-free core once the role gate passes.
 */
export async function generateDecisionIntelligence(
  userId: string,
  caseId: string,
): Promise<DecisionResult> {
  const officer = await getBankUser(userId);
  if (!officer) {
    return { ok: false, error: "Only bank staff can generate decision intelligence." };
  }
  return runDecisionIntelligence(caseId, userId);
}

/** Caches in-flight lazy generations so concurrent officer opens of the same
 * case collapse into a single provider call (per server instance). */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Lazy, background memo generation — the trigger for "a Risk Officer opened the
 * case". Idempotent and non-blocking by contract: it never throws, returns
 * immediately when a memo already exists, and de-duplicates concurrent triggers
 * for the same case. Safe to fire from a Server Component via `after()` so the
 * officer's page renders without waiting on the LLM (and the contractor's
 * submission never touches it). System-attributed (`requestedById = null`).
 */
export async function ensureDecisionIntelligence(caseId: string): Promise<void> {
  try {
    const existing = await prisma.decisionIntelligence.findFirst({
      where: { caseId },
      select: { id: true },
    });
    if (existing) return; // already generated (or reused) — nothing to do

    const pending = inFlight.get(caseId);
    if (pending) {
      await pending;
      return;
    }
    const run = runDecisionIntelligence(caseId, null).finally(() => inFlight.delete(caseId));
    inFlight.set(caseId, run);
    await run;
  } catch {
    // Best-effort: a failed lazy generation is audited inside
    // runDecisionIntelligence; the officer can retry via "Generate AI Analysis".
  }
}

/**
 * Guard-free memo generation. Callers: the officer wrapper above (after the
 * role gate) and `ensureDecisionIntelligence` (the lazy on-open trigger).
 * `requestedById` is the officer for a manual run, or null for a
 * system/lazy run (SetNull on the row keeps the memo if the user is gone).
 */
export async function runDecisionIntelligence(
  caseId: string,
  requestedById: string | null,
): Promise<DecisionResult> {
  const underwritingCase = await prisma.underwritingCase.findFirst({
    where: { id: caseId, status: { not: "DRAFT" } },
    include: {
      company: true,
      contractDetails: true,
      financialStatements: { orderBy: { fiscalYear: "desc" } },
      documents: {
        select: { fiscalYear: true, extraction: { select: { companyName: true } } },
      },
    },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };
  if (!underwritingCase.contractDetails) {
    return { ok: false, error: "Contract details are required for decision intelligence." };
  }

  const report = buildFinancialIntelligence(
    underwritingCase.financialStatements,
    underwritingCase.contractDetails,
    toIdentityInputs(underwritingCase.company.name, underwritingCase.documents),
  );
  if (!report) {
    return { ok: false, error: "No parsed financial statements are available for this case." };
  }

  const provider = getLLMProvider();
  const input = buildDecisionInput(
    underwritingCase.reference,
    underwritingCase.company,
    underwritingCase.contractDetails,
    report,
  );
  const userMessage = buildUserMessage(input);
  const inputHash = computeInputHash(userMessage, provider);

  // Response cache: same engine output + prompt + provider + model ⇒ reuse.
  const cached = await prisma.decisionIntelligence.findFirst({
    where: { caseId, inputHash },
    orderBy: { createdAt: "desc" },
  });
  if (cached) return { ok: true, decision: cached, cached: true };

  const startedAt = Date.now();
  let response: DecisionResponse;
  try {
    response = await requestValidatedDecision(provider, userMessage);
  } catch (error) {
    await recordAudit({
      action: "case.decision_failed",
      actorId: requestedById,
      caseId,
      detail: {
        provider: provider.name,
        model: provider.model,
        error: error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
      },
    });
    return { ok: false, error: userFacingError(error) };
  }

  // Recommendation of record = deterministic bank policy. A diverging model
  // value is preserved and flagged — transparency without delegation.
  const policyRecommendation = RECOMMENDATION_BY_BAND[report.risk.band];
  const aiDiverged = response.recommendation !== policyRecommendation;

  const decision = await prisma.decisionIntelligence.create({
    data: {
      caseId,
      requestedById,
      inputSnapshot: input as unknown as Prisma.InputJsonValue,
      inputHash,
      provider: provider.name,
      model: provider.model,
      promptVersion: PROMPT_VERSION,
      latencyMs: Date.now() - startedAt,
      summary: response.summary,
      companyStrengths: response.companyStrengths,
      companyWeaknesses: response.companyWeaknesses,
      contractAssessment: response.contractAssessment,
      riskExplanation: response.riskExplanation,
      recommendationReason: response.recommendationReason,
      missingInformation: response.missingInformation,
      confidenceExplanation: response.confidenceExplanation,
      nextSteps: response.nextSteps,
      recommendation: policyRecommendation,
      aiRecommendation: response.recommendation,
      aiDiverged,
    },
  });

  await recordAudit({
    action: "case.decision_generated",
    actorId: requestedById,
    caseId,
    detail: {
      provider: provider.name,
      model: provider.model,
      promptVersion: PROMPT_VERSION,
      recommendation: policyRecommendation,
      aiDiverged,
      latencyMs: decision.latencyMs,
    },
  });

  return { ok: true, decision, cached: false };
}
