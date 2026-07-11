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

/** Retried once when the configured vision model is unavailable (404). */
const VISION_FALLBACK_MODEL = "gpt-4o";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly visionModel: string;
  private readonly apiKey: string;

  constructor(options: { apiKey: string; model: string; visionModel?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.visionModel = options.visionModel ?? options.model;
  }

  async completeJSON(request: LLMRequest): Promise<LLMResult> {
    return this.chat(
      this.model,
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
    const messages = [
      { role: "system", content: request.system },
      { role: "user", content },
    ];
    try {
      return await this.chat(this.visionModel, messages, request);
    } catch (error) {
      // A 404 means THIS account/model combination doesn't exist (e.g. gpt-4.1
      // not yet available on the key) — the request itself is fine, so retry
      // it once on the widely-available fallback instead of failing extraction.
      const modelUnavailable =
        error instanceof LLMProviderError &&
        error.status === 404 &&
        this.visionModel !== VISION_FALLBACK_MODEL;
      if (!modelUnavailable) throw error;
      console.warn(
        `[openai-provider] vision model "${this.visionModel}" unavailable (404); retrying with "${VISION_FALLBACK_MODEL}"`,
      );
      return this.chat(VISION_FALLBACK_MODEL, messages, request);
    }
  }

  /** Shared POST + error mapping for both text and vision calls. */
  private async chat(
    model: string,
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
          model,
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
      throw new LLMProviderError(
        "BAD_RESPONSE",
        `OpenAI request failed (${response.status})`,
        response.status,
      );
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
