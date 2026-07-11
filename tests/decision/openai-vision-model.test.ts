import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIProvider } from "@/lib/ai/openai-provider";

/** Chat Completions success payload with the given content. */
function ok(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200 },
  );
}

const visionRequest = {
  system: "s",
  user: "u",
  images: ["data:image/png;base64,AAAA"],
  maxOutputTokens: 100,
  temperature: 0,
  timeoutMs: 5_000,
};

describe("OpenAIProvider model routing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the vision model for vision calls and the base model for text calls", async () => {
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        models.push((JSON.parse(init!.body as string) as { model: string }).model);
        return ok("{}");
      }),
    );

    const provider = new OpenAIProvider({ apiKey: "k", model: "gpt-4o-mini", visionModel: "gpt-4.1" });
    await provider.completeJSON({ system: "s", user: "u", maxOutputTokens: 10, temperature: 0, timeoutMs: 5_000 });
    await provider.completeVisionJSON(visionRequest);
    expect(models).toEqual(["gpt-4o-mini", "gpt-4.1"]);
  });

  it("retries a vision call once on gpt-4o when the vision model is unavailable (404)", async () => {
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const model = (JSON.parse(init!.body as string) as { model: string }).model;
        models.push(model);
        return model === "gpt-4.1" ? new Response("not found", { status: 404 }) : ok('{"x":1}');
      }),
    );

    const provider = new OpenAIProvider({ apiKey: "k", model: "gpt-4o-mini", visionModel: "gpt-4.1" });
    const result = await provider.completeVisionJSON(visionRequest);
    expect(models).toEqual(["gpt-4.1", "gpt-4o"]);
    expect(result.text).toBe('{"x":1}');
  });

  it("does not mask non-404 vision failures with a fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("throttled", { status: 429 })));
    const provider = new OpenAIProvider({ apiKey: "k", model: "gpt-4o-mini", visionModel: "gpt-4.1" });
    await expect(provider.completeVisionJSON(visionRequest)).rejects.toMatchObject({
      kind: "RATE_LIMIT",
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });
});
