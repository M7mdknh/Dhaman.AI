/**
 * Assessment Confidence — presentation only.
 *
 * NOT part of any engine and NOT part of the validator: nothing here computes
 * a figure, re-checks a statement, or changes a verdict. It reads the
 * IntegrityReport the Financial Integrity Validator already produced and
 * translates it into what a Risk Officer needs to see:
 *
 *   • how far the assessment can be trusted (High / Medium / Low), and
 *   • a Validation Report saying what happened and what to do about it.
 *
 * TWO AUDIENCES, TWO VOCABULARIES. A Risk Officer is a financial professional:
 * "assets do not equal liabilities + equity" is their language and the numbers
 * belong in front of them. A contractor is not being audited by this screen —
 * they need to know the DOCUMENT could not be verified, never that their
 * company is suspect. `contractorNotice()` is deliberately the only copy the
 * applicant sees about a validation failure.
 */
import type { Tone } from "@/lib/finance/display";
import type {
  IntegrityFinding,
  IntegrityReport,
} from "@/services/finance/financial-integrity-validator";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ConfidenceMeta {
  level: ConfidenceLevel;
  /** Badge text. */
  label: string;
  tone: Tone;
  /** One sentence: what this level means for the reader's decision. */
  summary: string;
}

export const CONFIDENCE_META: Record<ConfidenceLevel, ConfidenceMeta> = {
  HIGH: {
    level: "HIGH",
    label: "High Confidence",
    tone: "emerald",
    summary:
      "All required financial information was validated successfully. The assessment rests on the complete set of figures printed in the audited statements.",
  },
  MEDIUM: {
    level: "MEDIUM",
    label: "Medium Confidence",
    tone: "amber",
    summary:
      "The assessment was completed using partial financial information — some figures could not be validated. The results remain usable, but review the points below before relying on them.",
  },
  LOW: {
    level: "LOW",
    label: "Low Confidence",
    tone: "red",
    summary:
      "The financial statements did not pass integrity validation, so no underwriting recommendation has been produced. The figures could not be confirmed as those printed in the audited statements.",
  },
};

/**
 * Confidence follows the validator's verdict, never a re-judgement of it:
 *   LOW    — nothing survived validation (the engine produced no assessment).
 *   MEDIUM — an assessment exists but a year was withheld or a check warned.
 *   HIGH   — everything validated.
 * INFO findings (single year, year gap) are context, not doubt, so they do not
 * lower confidence — they are still listed in the report.
 */
export function assessmentConfidence(report: IntegrityReport): ConfidenceLevel {
  if (!report.ok) return "LOW";
  const warned = report.findings.some((f) => f.severity === "WARNING");
  return warned || report.rejectedYears.length > 0 ? "MEDIUM" : "HIGH";
}

/** A Validation Report is only worth showing when something needs saying. */
export function needsValidationReport(report: IntegrityReport): boolean {
  return report.findings.some((f) => f.severity !== "INFO");
}

export interface ValidationIssueView {
  severity: IntegrityFinding["severity"];
  /** Plain heading a banker reads first. */
  title: string;
  /** The validator's own specifics — which figures, which amounts. */
  detail: string;
  fiscalYear: number | null;
  tone: Tone;
}

export interface ValidationReportView {
  confidence: ConfidenceMeta;
  /** What happened + why the assessment was affected. */
  summary: string;
  /** Fiscal years the issues concern. */
  affectedYears: number[];
  /** Years withheld from the assessment entirely. */
  excludedYears: number[];
  /** Years the assessment was built from ([] when none survived). */
  assessedYears: number[];
  issues: ValidationIssueView[];
  recommendedAction: string;
}

/**
 * Human heading per validator code. The validator's own message supplies the
 * specifics (which figures, which amounts); this supplies the sentence a
 * reader can act on. Every code the validator can emit is covered — an
 * unmapped code falls back to a neutral heading rather than leaking the code.
 */
const ISSUE_TITLE: Record<string, string> = {
  NO_STATEMENTS: "No financial statements could be read",
  MISSING_CORE_FIGURES: "Required figures are missing from this statement",
  IMPOSSIBLE_NEGATIVE: "A figure was read with an impossible value",
  BALANCE_SHEET_DOES_NOT_BALANCE: "The balance sheet does not balance",
  SUBTOTAL_EXCEEDS_TOTAL: "A subtotal is larger than the total containing it",
  CURRENCY_INCONSISTENT: "The statements are in more than one currency",
  DUPLICATE_FISCAL_YEAR: "The same financial year was read twice",
  SCALE_INCONSISTENT: "The years appear to be stated in different units",
  NET_INCOME_IMPLAUSIBLE_VS_REVENUE: "Net income is out of proportion to revenue",
  RATIO_IMPLAUSIBLE: "A ratio computes to an impossible value",
  SINGLE_YEAR_ONLY: "Only one financial year is available",
  FISCAL_YEAR_GAP: "The financial years are not consecutive",
  PARTIAL_YEARS_WITHHELD: "Part of the assessment was set aside",
};

const SEVERITY_TONE: Record<IntegrityFinding["severity"], Tone> = {
  BLOCKING: "red",
  WARNING: "amber",
  INFO: "neutral",
};

export const SEVERITY_LABEL: Record<IntegrityFinding["severity"], string> = {
  BLOCKING: "Blocking",
  WARNING: "Warning",
  INFO: "For information",
};

/** Blocking first, then warnings, then context — worst news leads. */
const SEVERITY_ORDER: Record<IntegrityFinding["severity"], number> = {
  BLOCKING: 0,
  WARNING: 1,
  INFO: 2,
};

function summaryFor(report: IntegrityReport, level: ConfidenceLevel): string {
  const excluded = report.rejectedYears;
  const assessed = report.usableYears;
  if (level === "LOW") {
    return excluded.length > 0
      ? `The figures read from ${listYears(excluded)} could not be confirmed as those printed in the audited statements, so no year could be assessed and no recommendation has been produced.`
      : "No financial year passed validation, so no recommendation has been produced.";
  }
  if (level === "MEDIUM" && excluded.length > 0) {
    return `${listYears(excluded)} could not be confirmed as printed and ${excluded.length === 1 ? "was" : "were"} excluded. The assessment below is built only on ${listYears(assessed)} — every figure, ratio and score reflects ${assessed.length === 1 ? "that year" : "those years"} alone.`;
  }
  if (level === "MEDIUM") {
    return `The assessment covers ${listYears(assessed)}, but some checks could not be fully confirmed. The figures below are usable; the points listed here are worth verifying against the statement before relying on them.`;
  }
  return `Every required figure for ${listYears(assessed)} was validated against the audited statements.`;
}

function actionFor(report: IntegrityReport, level: ConfidenceLevel): string {
  if (level === "LOW") {
    return "Ask the applicant to re-upload the standalone audited financial statements issued by their auditor. A full-page annual report or a scanned copy is often read less reliably than the auditor's own statements. Processing can then be retried from the case page.";
  }
  if (report.rejectedYears.length > 0) {
    return `Treat the assessment as covering ${listYears(report.usableYears)} only. If the excluded ${report.rejectedYears.length === 1 ? "year is" : "years are"} material to your decision, request the audited statements for ${listYears(report.rejectedYears)} and retry processing.`;
  }
  return "Verify the points above against the uploaded statement before relying on the affected figures. The deterministic analysis is otherwise complete.";
}

function listYears(years: number[]): string {
  const labelled = years.map((y) => `FY${y}`);
  if (labelled.length === 0) return "no financial year";
  if (labelled.length === 1) return labelled[0];
  return `${labelled.slice(0, -1).join(", ")} and ${labelled.at(-1)}`;
}

/** The whole Validation Report, assembled from the validator's own findings. */
export function buildValidationReport(report: IntegrityReport): ValidationReportView {
  const level = assessmentConfidence(report);
  const issues = [...report.findings]
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        (b.fiscalYear ?? 0) - (a.fiscalYear ?? 0),
    )
    .map((f) => ({
      severity: f.severity,
      title: ISSUE_TITLE[f.code] ?? "A validation check did not pass",
      detail: f.message,
      fiscalYear: f.fiscalYear,
      tone: SEVERITY_TONE[f.severity],
    }));

  const affected = [
    ...new Set(report.findings.map((f) => f.fiscalYear).filter((y): y is number => y !== null)),
  ].sort((a, b) => b - a);

  return {
    confidence: CONFIDENCE_META[level],
    summary: summaryFor(report, level),
    affectedYears: affected,
    excludedYears: report.rejectedYears,
    assessedYears: report.usableYears,
    issues,
    recommendedAction: actionFor(report, level),
  };
}

/**
 * The ONLY validation copy an applicant sees. It never names a figure, never
 * shows arithmetic, and never implies the company's finances are the problem —
 * the document could not be verified, and that is a document problem.
 */
export function contractorNotice(): { title: string; body: string } {
  return {
    title: "We couldn't confidently verify your financial statements",
    body: "We couldn't confidently verify parts of your financial statements, so we've stopped rather than assess them on figures we're unsure of. This is about how the document was read — not about your company. Please upload the original audited financial statements issued by your auditor, or retry document processing below.",
  };
}
