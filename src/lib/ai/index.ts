/**
 * Provider selection — the ONLY place that knows which concrete providers
 * exist. No API key never crashes the app: it selects the MockProvider so
 * every environment stays deployable. Future providers (Claude, Azure
 * OpenAI, Gemini, …) are added here and nowhere else.
 */
import { env } from "@/lib/env";
import { MockProvider } from "@/lib/ai/mock-provider";
import { OpenAIProvider } from "@/lib/ai/openai-provider";

import type { LLMProvider } from "@/lib/ai/provider";

export function getLLMProvider(): LLMProvider {
  if (env.LLM_PROVIDER === "mock") return new MockProvider();

  if (env.OPENAI_API_KEY) {
    return new OpenAIProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      visionModel: env.OPENAI_VISION_MODEL,
    });
  }

  // LLM_PROVIDER=openai without a key still degrades gracefully.
  return new MockProvider();
}
