import { describe, expect, it } from "vitest";

import { figuresByYear } from "@/lib/ifrs/normalizer";
import { extractViaVision, toFigures } from "@/services/extraction/vision-extractor";

import { textPagesToPdf } from "../fixtures/pdf-writer";

import type { LLMProvider } from "@/lib/ai/provider";
import type { DocumentQualityReport } from "@/lib/ifrs/text-quality";

const SAMPLE_YEAR = {
  fiscalYear: 2025,
  revenue: 120_000_000,
  netIncome: 18_000_000,
  cash: 40_000_000,
  currentAssets: 90_000_000,
  currentLiabilities: 45_000_000,
  totalAssets: 200_000_000,
  totalLiabilities: 80_000_000,
  totalEquity: 120_000_000,
  operatingCashFlow: 22_000_000,
  totalDebt: 50_000_000,
  cogs: -84_000_000,
};

/** A vision provider that returns a fixed extraction, ignoring the images. */
function fakeVisionProvider(payload: unknown): LLMProvider {
  return {
    name: "fake",
    model: "fake",
    async completeJSON() {
      throw new Error("unused");
    },
    async completeVisionJSON() {
      return { text: JSON.stringify(payload) };
    },
  };
}

const IMAGE_ONLY_QUALITY: DocumentQualityReport = {
  pages: [
    { pageNumber: 1, quality: "IMAGE_ONLY", chars: 0, puaRatio: 0, arabic: 0, latin: 0, digits: 0 },
  ],
  hasGoodText: false,
  ocrPageNumbers: [1],
  script: "UNKNOWN",
};

describe("toFigures", () => {
  it("maps model numbers to decimal strings and groups line items by key", () => {
    const { figures, lineItems } = toFigures([SAMPLE_YEAR]);
    expect(figures.get(2025)?.revenue).toBe("120000000.00");
    expect(figures.get(2025)?.cogs).toBe("-84000000.00"); // sign preserved as printed
    // Cache consistency: reconstructing from the persisted line items must match.
    const reconstructed = figuresByYear(lineItems);
    expect(reconstructed.get(2025)?.revenue).toBe("120000000.00");
    expect(reconstructed.get(2025)?.totalEquity).toBe("120000000.00");
  });

  it("groups multiple years under one line item per key", () => {
    const { lineItems } = toFigures([SAMPLE_YEAR, { ...SAMPLE_YEAR, fiscalYear: 2024 }]);
    const revenueItems = lineItems.filter((i) => i.normalizedKey === "revenue");
    expect(revenueItems).toHaveLength(1);
    expect(revenueItems[0].values.map((v) => v.fiscalYear).sort()).toEqual([2024, 2025]);
  });
});

describe("extractViaVision", () => {
  const pdf = textPagesToPdf(["Statement page — rendered to an image for vision."]);

  it("returns a VISION-sourced extraction with a provenance warning", async () => {
    const provider = fakeVisionProvider({ currency: "SAR", years: [SAMPLE_YEAR] });
    const result = await extractViaVision(pdf, IMAGE_ONLY_QUALITY, [], provider);

    expect(result).not.toBeNull();
    expect(result!.meta.textSource).toBe("VISION");
    expect(result!.meta.valuesTrusted).toBe(true);
    expect(result!.result.currency).toBe("SAR");
    expect(result!.figures.get(2025)?.revenue).toBe("120000000.00");
    expect(result!.validation.errors).toHaveLength(0);
    expect(result!.validation.warnings.map((w) => w.code)).toContain("VISION_EXTRACTION");
  });

  it("returns null when the model yields no years (→ caller falls back to OCR)", async () => {
    const provider = fakeVisionProvider({ currency: null, years: [] });
    const result = await extractViaVision(pdf, IMAGE_ONLY_QUALITY, [], provider);
    expect(result).toBeNull();
  });

  it("returns null when the provider has no vision capability", async () => {
    const textOnly: LLMProvider = {
      name: "text",
      model: "text",
      async completeJSON() {
        return { text: "{}" };
      },
    };
    const result = await extractViaVision(pdf, IMAGE_ONLY_QUALITY, [], textOnly);
    expect(result).toBeNull();
  });
});
