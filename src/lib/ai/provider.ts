/**
 * LLM provider abstraction. The application is NEVER coupled to a concrete
 * vendor: everything above this interface (prompt builder, decision service,
 * UI) only ever sees `LLMProvider`. Adding ClaudeProvider /
 * AzureOpenAIProvider / GeminiProvider means implementing this one interface
 * and registering it in the factory (`lib/ai/index.ts`) — no architectural
 * change.
 */

export interface LLMRequest {
  /** Role/instructions prompt (versioned, from the prompt builder). */
  system: string;
  /** Structured JSON input as a string — never PDFs, never raw statements. */
  user: string;
  maxOutputTokens: number;
  /** 0–1; decision memos run near-deterministic (low). */
  temperature: number;
  timeoutMs: number;
}

export interface LLMResult {
  /** Raw model output — expected to be a single JSON object. */
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface LLMProvider {
  /** Stable identifier persisted with every memo ("openai", "mock", …). */
  readonly name: string;
  /** Concrete model identifier persisted with every memo. */
  readonly model: string;
  /** Single completion call. Must reject with LLMProviderError on failure. */
  completeJSON(request: LLMRequest): Promise<LLMResult>;
}

export type LLMErrorKind =
  | "AUTH" // bad/missing credentials — never retried
  | "RATE_LIMIT" // provider throttling — retried with backoff
  | "TIMEOUT" // request exceeded timeoutMs — retried
  | "NETWORK" // connection failure — retried
  | "BAD_RESPONSE"; // provider returned an unusable payload — retried once

const RETRYABLE: Record<LLMErrorKind, boolean> = {
  AUTH: false,
  RATE_LIMIT: true,
  TIMEOUT: true,
  NETWORK: true,
  BAD_RESPONSE: true,
};

export class LLMProviderError extends Error {
  readonly kind: LLMErrorKind;
  readonly retryable: boolean;

  constructor(kind: LLMErrorKind, message: string) {
    super(message);
    this.name = "LLMProviderError";
    this.kind = kind;
    this.retryable = RETRYABLE[kind];
  }
}
