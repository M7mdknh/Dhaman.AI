/**
 * MockProvider — the no-API-key fallback that keeps Dhaman deployable and
 * demoable without AI. It reads the SAME structured JSON input the real
 * providers receive and assembles the memo fields from deterministic
 * template sentences. Every generated text is prefixed so nobody can
 * mistake it for model output.
 *
 * It deliberately parses the input loosely (unknown-shaped JSON): lib/ai
 * must not depend on the decision service's types — providers stay below
 * the service layer.
 */
import {
  LLMProviderError,
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
} from "@/lib/ai/provider";

const PREFIX = "[Deterministic draft — generated without an AI provider]";

type Dict = Record<string, unknown>;

const dict = (value: unknown): Dict =>
  typeof value === "object" && value !== null ? (value as Dict) : {};
const str = (value: unknown, fallback = "n/a"): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;
const num = (value: unknown): string => (typeof value === "number" ? String(value) : "n/a");
const list = (value: unknown): Dict[] => (Array.isArray(value) ? value.map(dict) : []);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "deterministic-template";

  async completeJSON(request: LLMRequest): Promise<LLMResult> {
    let input: Dict;
    try {
      input = dict(JSON.parse(request.user));
    } catch {
      throw new LLMProviderError("BAD_RESPONSE", "Mock provider received a non-JSON user message");
    }

    const company = dict(input.company);
    const contract = dict(input.contract);
    const capacity = dict(input.underwritingCapacity);
    const risk = dict(input.riskScore);
    const policy = dict(input.bankPolicy);
    const flags = list(input.riskFlags);
    const companyName = str(company.name, "The applicant");
    const recommendation = str(policy.policyRecommendation, "MANUAL_REVIEW");

    const strengths = list(capacity.components)
      .filter((c) => typeof c.score === "number" && (c.score as number) >= 0.8)
      .map((c) => `${PREFIX} ${str(c.label)}: ${str(c.detail)}.`);
    const weaknesses = [
      ...list(capacity.components)
        .filter((c) => typeof c.score === "number" && (c.score as number) < 0.4)
        .map((c) => `${PREFIX} ${str(c.label)}: ${str(c.detail)}.`),
      ...flags
        .filter((f) => str(f.severity) === "HIGH")
        .map((f) => `${PREFIX} ${str(f.type)}: ${str(f.explanation)}`),
    ];
    const missing = [
      ...strings(capacity.missingInputs),
      ...strings(risk.missingInputs),
    ].map((m) => `${PREFIX} ${m} could not be computed from the submitted statements.`);

    const body = {
      summary: `${PREFIX} ${companyName} (${str(company.sector)}, ${str(company.city)}) requests a ${str(contract.guaranteeType)} guarantee of ${str(contract.guaranteeAmount)} ${str(contract.currency, "SAR")} for “${str(contract.title)}” with ${str(contract.beneficiary)}. The deterministic engines score underwriting capacity ${num(capacity.score)}/100 (${str(capacity.band)}) and risk ${num(risk.score)}/100 (${str(risk.band)}).`,
      companyStrengths: strengths.length > 0 ? strengths : [`${PREFIX} No component scored strongly enough to list as a strength.`],
      companyWeaknesses: weaknesses.length > 0 ? weaknesses : [`${PREFIX} No material weaknesses were detected by the deterministic engines.`],
      contractAssessment: `${PREFIX} Contract “${str(contract.title)}” (${str(contract.value)} ${str(contract.currency, "SAR")}, ${num(contract.durationMonths)} months, ${str(contract.beneficiaryType)} beneficiary) was sized against the company's scale by the capacity engine — see the component breakdown for the exact ratios.`,
      riskExplanation:
        flags.length === 0
          ? `${PREFIX} The deterministic engines raised no risk flags across the analyzed years.`
          : `${PREFIX} ${flags.length} risk flag(s) were detected: ${flags.map((f) => `${str(f.type)} (${str(f.severity)})`).join("; ")}.`,
      recommendation,
      recommendationReason: `${PREFIX} Bank policy maps risk band ${str(risk.band)} to ${recommendation.replaceAll("_", " ")}. This mapping is deterministic; an AI provider would add narrative context here.`,
      missingInformation: missing.length > 0 ? missing : [`${PREFIX} All engine inputs were available.`],
      confidenceExplanation: `${PREFIX} Confidence reflects data completeness only: ${strings(capacity.missingInputs).length + strings(risk.missingInputs).length} engine input(s) were missing. Configure an AI provider for a narrative assessment.`,
      nextSteps: [
        `${PREFIX} A Risk Officer must review the full underwriting package before any decision.`,
        `${PREFIX} Configure OPENAI_API_KEY to replace this template with an AI-drafted memo.`,
      ],
    };

    return { text: JSON.stringify(body) };
  }

  /**
   * No vision without a provider: returns an EMPTY extraction so the caller
   * treats vision as unavailable and falls back to the deterministic OCR path.
   * (The mock cannot see the images.)
   */
  async completeVisionJSON(): Promise<LLMResult> {
    return { text: JSON.stringify({ currency: null, years: [] }) };
  }
}
