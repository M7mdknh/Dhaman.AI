import { describe, expect, it } from "vitest";

import { looksLikePdf } from "@/lib/case-constants";

describe("looksLikePdf (pre-upload MIME gate)", () => {
  it("accepts a properly typed PDF", () => {
    expect(looksLikePdf("statements-2025.pdf", "application/pdf")).toBe(true);
  });

  it("accepts a .pdf with an EMPTY type (Android pickers, WhatsApp saves)", () => {
    expect(looksLikePdf("Annual Report 2024.pdf", "")).toBe(true);
    expect(looksLikePdf("Annual Report 2024.PDF", "")).toBe(true);
  });

  it("accepts a .pdf declared as octet-stream (generic download managers)", () => {
    expect(looksLikePdf("stc-financials.pdf", "application/octet-stream")).toBe(true);
  });

  it("rejects non-PDF types regardless of extension", () => {
    expect(looksLikePdf("statements.pdf", "image/png")).toBe(false);
    expect(looksLikePdf("statements.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
  });

  it("rejects untyped files without a .pdf extension", () => {
    expect(looksLikePdf("statements", "")).toBe(false);
    expect(looksLikePdf("statements.exe", "application/octet-stream")).toBe(false);
  });
});
