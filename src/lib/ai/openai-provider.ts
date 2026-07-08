/**
 * OpenAI Chat Completions provider. Plain `fetch` — no SDK dependency.
 * JSON mode is requested (`response_format: json_object`); the decision
 * service still validates every byte with zod before anything is persisted.
 */
import {
  LLMProviderError,
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
  type VisionExtractRequest,
} from "@/lib/ai/provider";

const API_URL = "https://api.openai.com/v1/chat/completions";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** A single Chat Completions message `content` — text or an image part. */
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async completeJSON(request: LLMRequest): Promise<LLMResult> {
    return this.chat(
      [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      request,
    );
  }

  async completeVisionJSON(request: VisionExtractRequest): Promise<LLMResult> {
    // "high" detail keeps small statement figures legible; the caller sends
    // only the statement pages, so the token cost stays bounded.
    const content: ContentPart[] = [
      { type: "text", text: request.user },
      ...request.images.map(
        (url): ContentPart => ({ type: "image_url", image_url: { url, detail: "high" } }),
      ),
    ];
    return this.chat(
      [
        { role: "system", content: request.system },
        { role: "user", content },
      ],
      request,
    );
  }

  /** Shared POST + error mapping for both text and vision calls. */
  private async chat(
    messages: Array<{ role: string; content: string | ContentPart[] }>,
    request: { temperature: number; maxOutputTokens: number; timeoutMs: number },
  ): Promise<LLMResult> {
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
          messages,
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
