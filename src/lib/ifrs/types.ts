/**
 * IFRS extraction pipeline — shared types.
 *
 * The pipeline is pure: bytes/text in, typed results out. No I/O, no
 * Prisma, no framework imports anywhere under src/lib/ifrs/.
 */

export const PARSER_NAME = "daman-ifrs-ts/1";

export type StatementType =
  | "FINANCIAL_POSITION"
  | "PROFIT_OR_LOSS"
  | "CASH_FLOWS"
  | "CHANGES_IN_EQUITY";

export const STATEMENT_LABELS: Record<StatementType, string> = {
  FINANCIAL_POSITION: "Statement of Financial Position",
  PROFIT_OR_LOSS: "Statement of Profit or Loss",
  CASH_FLOWS: "Statement of Cash Flows",
  CHANGES_IN_EQUITY: "Statement of Changes in Equity",
};

/** Statements that MUST be present for a usable extraction. */
export const REQUIRED_STATEMENTS: StatementType[] = [
  "FINANCIAL_POSITION",
  "PROFIT_OR_LOSS",
  "CASH_FLOWS",
];

export type PdfErrorCode = "PASSWORD_PROTECTED" | "CORRUPTED" | "NO_TEXT";

/** Raised by pdf-text when the document cannot yield usable text. */
export class PdfReadError extends Error {
  constructor(
    public readonly code: PdfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfReadError";
  }
}

export interface PageText {
  /** 1-based page number. */
  pageNumber: number;
  text: string;
}

export interface DetectedStatement {
  type: StatementType;
  /** 1-based page numbers the statement spans. */
  pages: number[];
}

export interface LineItemValue {
  fiscalYear: number;
  /** Value exactly as printed, e.g. "(1,234.5)". */
  original: string;
  /** Absolute decimal string after sign + scale normalization, e.g. "-1234500". */
  normalized: string;
}

export interface ExtractedLineItem {
  statement: StatementType;
  /** Label exactly as printed (note references stripped). */
  originalLabel: string;
  /** Canonical key (matches FinancialStatement columns) or null if unmapped. */
  normalizedKey: string | null;
  values: LineItemValue[];
}

export interface ExtractionResult {
  currency: string | null;
  /** Multiplier the source used ("SAR '000" → 1000). Normalized values are absolute. */
  scale: number;
  /** Fiscal years covered, newest first. */
  fiscalYears: number[];
  companyName: string | null;
  statements: DetectedStatement[];
  lineItems: ExtractedLineItem[];
}

/** How the text used for extraction was obtained. */
export type TextSource = "TEXT_LAYER" | "OCR" | "HYBRID";

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationOutcome {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
