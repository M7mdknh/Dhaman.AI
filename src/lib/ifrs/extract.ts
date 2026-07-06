/**
 * Full IFRS extraction pipeline (pure): PDF bytes → detected statements →
 * line items → normalized figures → validation. No I/O, no Prisma.
 */
import {
  detectCurrency,
  detectCompanyName,
  detectFiscalYears,
  detectScale,
  extractLineItems,
} from "@/lib/ifrs/line-extractor";
import { figuresByYear, normalizeLineItems, type FiguresByYear } from "@/lib/ifrs/normalizer";
import { extractPdfPages } from "@/lib/ifrs/pdf-text";
import { detectStatements } from "@/lib/ifrs/statement-detector";
import { validateExtraction } from "@/lib/ifrs/validator";

import type { ExtractionResult, ValidationOutcome } from "@/lib/ifrs/types";

export interface IfrsExtraction {
  result: ExtractionResult;
  figures: FiguresByYear;
  validation: ValidationOutcome;
}

/** Rejects with PdfReadError for unusable PDFs (password / corrupted / scanned). */
export async function extractIfrs(bytes: Buffer): Promise<IfrsExtraction> {
  const pages = await extractPdfPages(bytes);
  const fullText = pages.map((p) => p.text).join("\n");

  const scale = detectScale(fullText);
  const currency = detectCurrency(fullText);
  const companyName = detectCompanyName(pages[0]);
  const statements = detectStatements(pages);

  const lineItems = statements.flatMap((statement) => {
    const statementPages = pages.filter((p) => statement.pages.includes(p.pageNumber));
    const statementText = statementPages.map((p) => p.text).join("\n");
    const years = detectFiscalYears(statementText, fullText);
    return extractLineItems(statement.type, statementPages, years, scale);
  });

  const normalized = normalizeLineItems(lineItems);
  const figures = figuresByYear(normalized);
  const validation = validateExtraction(statements, figures);

  const fiscalYears = [...figures.keys()].sort((a, b) => b - a);

  return {
    result: { currency, scale, fiscalYears, companyName, statements, lineItems: normalized },
    figures,
    validation,
  };
}
