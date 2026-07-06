/**
 * Full pipeline integration: fabricated statement PDF → extractIfrs.
 * Exercises the real MuPDF text layer, not just text fixtures.
 */
import { describe, expect, it } from "vitest";

import { extractIfrs } from "@/lib/ifrs/extract";
import { PdfReadError } from "@/lib/ifrs/types";

import { STRONG_PROFILE } from "../fixtures/company-profiles";
import { textPagesToPdf } from "../fixtures/pdf-writer";
import { cashFlowsPage, financialPositionPage, profitOrLossPage } from "../fixtures/statement-text";

describe("extractIfrs over a real PDF", () => {
  it("extracts figures and passes validation", async () => {
    const pdf = textPagesToPdf([
      financialPositionPage(STRONG_PROFILE),
      profitOrLossPage(STRONG_PROFILE),
      cashFlowsPage(STRONG_PROFILE),
    ]);

    const { result, figures, validation } = await extractIfrs(pdf);

    expect(result.currency).toBe("SAR");
    expect(result.fiscalYears).toEqual([2025, 2024]);
    expect(result.statements.map((s) => s.type).sort()).toEqual([
      "CASH_FLOWS",
      "FINANCIAL_POSITION",
      "PROFIT_OR_LOSS",
    ]);
    expect(figures.get(2025)?.revenue).toBe("120000000");
    expect(figures.get(2025)?.totalEquity).toBe("75000000");
    expect(validation.errors).toEqual([]);
  });

  it("rejects a non-PDF and an empty text layer", async () => {
    await expect(extractIfrs(Buffer.from("not a pdf"))).rejects.toThrow(PdfReadError);
    await expect(extractIfrs(textPagesToPdf([""]))).rejects.toThrow(PdfReadError);
  });
});
