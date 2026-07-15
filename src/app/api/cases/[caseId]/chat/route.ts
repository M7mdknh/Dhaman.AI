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
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { INSIGHT_SYSTEM_PROMPT } from "@/lib/ai/insight-prompt";
import { getCaseForReview } from "@/services/officer-case-service";
import { buildDecisionInput } from "@/services/decision/prompt-builder";
import {
  buildFinancialIntelligence,
  toIdentityInputs,
} from "@/services/finance/financial-intelligence-service";

const CHAT_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 600;
const TEMPERATURE = 0.3;
const MAX_HISTORY_MESSAGES = 10; // last 5 user+assistant turns

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  message: string;
  history?: ChatMessage[];
}

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

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const { message, history = [] } = body;
  if (!message?.trim()) {
    return new Response("Message is required", { status: 400 });
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
  );

  const systemPrompt =
    INSIGHT_SYSTEM_PROMPT +
    "\n\n## Case Context (deterministic engine output — these figures are authoritative)\n\n" +
    JSON.stringify(decisionInput, null, 2);

  // Trim history to bound context window growth
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

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
