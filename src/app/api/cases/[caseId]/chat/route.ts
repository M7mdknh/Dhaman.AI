/**
 * Insight Chat streaming endpoint.
 *
 * POST /api/cases/[caseId]/chat
 * Body: { message: string, history?: { role: "user" | "assistant", content: string }[] }
 * Response: text/plain stream of token content
 *
 * Auth: Risk Officers, Relationship Managers, and Admins only.
 * Contractors cannot access another party's underwriting analysis.
 *
 * The case's deterministic engine output (DecisionInput) is injected as
 * context into every request — the model explains those numbers, never
 * re-derives them, and never makes a decision.
 */
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { INSIGHT_SYSTEM_PROMPT } from "@/lib/ai/insight-prompt";
import { recordAudit } from "@/services/audit-service";
import { getCompanyHistoryForCase } from "@/services/company-history-service";
import { getCaseForReview } from "@/services/officer-case-service";
import { isChatRateLimited } from "@/services/rate-limit-service";
import { buildDecisionInput } from "@/services/decision/prompt-builder";
import {
  buildFinancialIntelligence,
  toIdentityInputs,
} from "@/services/finance/financial-intelligence-service";

const CHAT_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 600;
const TEMPERATURE = 0.3;
const MAX_HISTORY_MESSAGES = 10; // last 5 user+assistant turns
// Bound the request so a single call cannot balloon the prompt (and the bill):
// a question is short; an assistant turn may be a drafted note, so it is roomier.
const MAX_MESSAGE_CHARS = 2_000;
const MAX_HISTORY_CONTENT_CHARS = 6_000;

// The client sends `message` + prior turns. Both are untrusted — validate the
// shape, the roles, and every length before any of it reaches the model.
const chatBodySchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(MAX_HISTORY_CONTENT_CHARS),
      }),
    )
    .max(MAX_HISTORY_MESSAGES)
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await getSession();
  if (!session || session.role === "CONTRACTOR") {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.OPENAI_API_KEY) {
    return new Response("AI service not configured for this deployment", { status: 503 });
  }

  const { caseId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const parsed = chatBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response("Message is required", { status: 400 });
  }
  const { message, history = [] } = parsed.data;

  // Each message is a billed OpenAI call — throttle per user (generous; guards
  // against a runaway loop or a stolen session, not normal interactive use).
  if (await isChatRateLimited(session.userId)) {
    return new Response("Too many requests. Please wait a moment and try again.", { status: 429 });
  }

  const reviewCase = await getCaseForReview(session.userId, caseId);
  if (!reviewCase) {
    return new Response("Case not found", { status: 404 });
  }

  const contract = reviewCase.contractDetails;
  if (!contract) {
    return new Response("Contract details not available for this case", { status: 422 });
  }

  const report = buildFinancialIntelligence(
    reviewCase.financialStatements,
    contract,
    toIdentityInputs(reviewCase.company.name, reviewCase.documents),
    reviewCase.qualitative,
    reviewCase.company.sector,
  );
  if (!report) {
    return new Response(
      "Financial analysis is not yet available — extraction must complete first",
      { status: 422 },
    );
  }

  const decisionInput = buildDecisionInput(
    reviewCase.reference,
    reviewCase.company,
    contract,
    report,
    reviewCase.qualitative,
  );

  // Cross-case awareness: the company's OTHER contracts, guarantees, and
  // outcomes with the bank — so the chat can answer portfolio questions
  // ("what else does this company have with us?") from recorded facts.
  const companyHistory = await getCompanyHistoryForCase(reviewCase.companyId, reviewCase.id);

  const systemPrompt =
    INSIGHT_SYSTEM_PROMPT +
    "\n\n## Case Context (deterministic engine output — these figures are authoritative)\n\n" +
    JSON.stringify(decisionInput, null, 2) +
    (companyHistory && companyHistory.totals.totalCases > 0
      ? "\n\n## Company History with the Bank (this company's OTHER cases — recorded facts, not estimates)\n\n" +
        JSON.stringify(companyHistory, null, 2)
      : "\n\n## Company History with the Bank\n\nThis is the company's first submitted case — no prior contracts or guarantees are on record.");

  // Trim history to bound context window growth
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

  // Record the query BEFORE the call — this is the event the rate limiter
  // counts, and it doubles as the audit trail of what officers asked about a
  // case. Message content is deliberately not stored (only its length).
  await recordAudit({
    action: "officer.insight_queried",
    actorId: session.userId,
    caseId,
    detail: { messageLength: message.length, historyLength: trimmedHistory.length },
  });

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedHistory,
          { role: "user", content: message },
        ],
      }),
    });
  } catch {
    return new Response("Could not reach the AI service", { status: 503 });
  }

  if (!openaiRes.ok || !openaiRes.body) {
    return new Response("AI service returned an error", { status: 503 });
  }

  // Parse OpenAI SSE chunks and forward only the token content as a plain
  // text stream — the client concatenates these into the message in real time.
  const upstream = openaiRes.body;
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) {
                controller.enqueue(new TextEncoder().encode(text));
              }
            } catch {
              // Skip malformed SSE lines — OpenAI occasionally emits keep-alives
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
