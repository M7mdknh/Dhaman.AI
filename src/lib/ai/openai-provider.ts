/**
 * OpenAI Chat Completions provider. Plain `fetch` — no SDK dependency.
 * JSON mode is requested (`response_format: json_object`); the decision
 * service still validates every byte with zod before anything is persisted.
 */
import { LLMProviderError, type LLMProvider, type LLMRequest, type LLMResult } from "@/lib/ai/provider";

const API_URL = "https://api.openai.com/v1/chat/completions";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async completeJSON(request: LLMRequest): Promise<LLMResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMProviderError("TIMEOUT", `OpenAI request exceeded ${request.timeoutMs}ms`);
      }
      throw new LLMProviderError("NETWORK", "Could not reach the OpenAI API");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Never include the response body in errors — it can echo request content.
      if (response.status === 401 || response.status === 403) {
        throw new LLMProviderError("AUTH", "OpenAI rejected the API key");
      }
      if (response.status === 429) {
        throw new LLMProviderError("RATE_LIMIT", "OpenAI rate limit reached");
      }
      if (response.status >= 500) {
        throw new LLMProviderError("BAD_RESPONSE", `OpenAI server error (${response.status})`);
      }
      throw new LLMProviderError("BAD_RESPONSE", `OpenAI request failed (${response.status})`);
    }

    let payload: ChatCompletionResponse;
    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch {
      throw new LLMProviderError("BAD_RESPONSE", "OpenAI returned a non-JSON payload");
    }

    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new LLMProviderError("BAD_RESPONSE", "OpenAI returned an empty completion");
    }

    return {
      text,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      },
    };
  }
}
