import { describe, expect, it } from "vitest";

import { MockProvider } from "@/lib/ai/mock-provider";
import { LLMProviderError, type LLMProvider, type LLMResult } from "@/lib/ai/provider";
import { decisionResponseSchema } from "@/lib/validation/decision";
import { requestValidatedDecision } from "@/services/decision/decision-intelligence-service";
import { buildDecisionInput, buildUserMessage } from "@/services/decision/prompt-builder";

import { strongCompany, strongContract, strongReport } from "../fixtures/decision-case";

const NO_BACKOFF = [0, 0] as const;

const userMessage = () =>
  buildUserMessage(
    buildDecisionInput("UC-2026-000001", strongCompany(), strongContract(), strongReport()),
  );

/** Scripted provider: yields the queued behaviors, then repeats the last. */
class FakeProvider implements LLMProvider {
  readonly name = "fake";
  readonly model = "fake-1";
  calls = 0;
  constructor(private script: (LLMResult | LLMProviderError)[]) {}

  async completeJSON(): Promise<LLMResult> {
    const step = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls += 1;
    if (step instanceof LLMProviderError) throw step;
    return step;
  }
}

describe("mock provider", () => {
  it("returns schema-valid JSON echoing the bank-policy recommendation", async () => {
    const response = await requestValidatedDecision(new MockProvider(), userMessage(), NO_BACKOFF);

    expect(decisionResponseSchema.safeParse(response).success).toBe(true);
    expect(response.recommendation).toBe("APPROVE"); // policy for EXCELLENT
    expect(response.summary).toContain("Deterministic draft");
  });

  it("is deterministic across calls", async () => {
    const provider = new MockProvider();
    const first = await requestValidatedDecision(provider, userMessage(), NO_BACKOFF);
    const second = await requestValidatedDecision(provider, userMessage(), NO_BACKOFF);
    expect(second).toEqual(first);
  });

  it("rejects a non-JSON user message as BAD_RESPONSE", async () => {
    await expect(
      new MockProvider().completeJSON({
        system: "s",
        user: "not json",
        maxOutputTokens: 10,
        temperature: 0,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
  });
});

describe("retry policy", () => {
  const validText = async () => (await new MockProvider().completeJSON({
    system: "s",
    user: userMessage(),
    maxOutputTokens: 10,
    temperature: 0,
    timeoutMs: 1000,
  })).text;

  it("retries an invalid response and succeeds on the next attempt", async () => {
    const provider = new FakeProvider([
      { text: "this is not the JSON you asked for" },
      { text: await validText() },
    ]);
    const response = await requestValidatedDecision(provider, userMessage(), NO_BACKOFF);
    expect(provider.calls).toBe(2);
    expect(response.recommendation).toBe("APPROVE");
  });

  it("retries retryable provider failures (network) up to the attempt cap", async () => {
    const provider = new FakeProvider([new LLMProviderError("NETWORK", "down")]);
    await expect(requestValidatedDecision(provider, userMessage(), NO_BACKOFF)).rejects.toMatchObject({
      kind: "NETWORK",
    });
    expect(provider.calls).toBe(3); // 1 call + 2 retries
  });

  it("never retries an AUTH failure", async () => {
    const provider = new FakeProvider([new LLMProviderError("AUTH", "bad key")]);
    await expect(requestValidatedDecision(provider, userMessage(), NO_BACKOFF)).rejects.toMatchObject({
      kind: "AUTH",
    });
    expect(provider.calls).toBe(1);
  });
});
