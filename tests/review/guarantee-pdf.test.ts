import { describe, expect, it } from "vitest";

import { PDFDocument } from "pdf-lib";

import { renderGuaranteePdf, type GuaranteePdfData } from "@/lib/pdf/guarantee-pdf";
import { formatGuaranteeReference } from "@/services/guarantee-service";

function sampleData(): GuaranteePdfData {
  return {
    reference: "LG-2026-000001",
    caseReference: "UC-2026-000028",
    companyName: "Rawabi Contracting Co.",
    crNumber: "1010111111",
    beneficiary: "Ministry of Municipal and Rural Affairs",
    guaranteeTypeLabel: "Performance Bond",
    amount: "6000000.00",
    currency: "SAR",
    contractTitle: "Riyadh North District Roads Package 3",
    issueDate: new Date("2026-07-07T00:00:00Z"),
    expiryDate: new Date("2028-08-31T00:00:00Z"),
    officerName: "Omar Al-Fahad",
  };
}

describe("guarantee reference", () => {
  it("mints LG-YYYY-NNNNNN from seq + issue year", () => {
    expect(formatGuaranteeReference(1, new Date("2026-07-07T00:00:00Z"))).toBe("LG-2026-000001");
    expect(formatGuaranteeReference(123456, new Date("2027-01-01T00:00:00Z"))).toBe(
      "LG-2027-123456",
    );
  });
});

describe("guarantee PDF", () => {
  it("renders a valid single-page PDF document", async () => {
    const bytes = await renderGuaranteePdf(sampleData());
    const header = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
    expect(header).toBe("%PDF-");
    // A real document with fonts + QR image, not an empty shell.
    expect(bytes.length).toBeGreaterThan(5_000);
    const tail = Buffer.from(bytes.subarray(-1024)).toString("latin1");
    expect(tail).toContain("%%EOF");
  });

  it("is deterministic apart from generation metadata (same data, same layout)", async () => {
    const a = await renderGuaranteePdf(sampleData());
    const b = await renderGuaranteePdf(sampleData());
    // pdf-lib stamps random IDs/dates, so bytes differ — but size must not.
    expect(Math.abs(a.length - b.length)).toBeLessThan(64);
  });

  it("embeds the guarantee title metadata and one A4 page", async () => {
    const bytes = await renderGuaranteePdf(sampleData());
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getTitle()).toBe("Letter of Guarantee LG-2026-000001");
    expect(parsed.getPageCount()).toBe(1);
    const { width, height } = parsed.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });
});
