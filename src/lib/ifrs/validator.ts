/**
 * Structural validation of an extraction. Errors block case submission
 * (the document is unusable for underwriting); warnings pass through and
 * are displayed. Pure: no I/O.
 */
import { addAmounts, compareAmounts } from "@/lib/ifrs/amounts";
import { REQUIRED_STATEMENTS, STATEMENT_LABELS } from "@/lib/ifrs/types";

import type { FiguresByYear } from "@/lib/ifrs/normalizer";
import type {
  DetectedStatement,
  ValidationIssue,
  ValidationOutcome,
} from "@/lib/ifrs/types";

/** Figures the engines need most; missing ones become warnings, not errors. */
const CORE_KEYS = [
  "revenue",
  "netIncome",
  "cash",
  "currentAssets",
  "totalAssets",
  "currentLiabilities",
  "totalLiabilities",
  "totalEquity",
  "operatingCashFlow",
] as const;

/** |assets − (liabilities + equity)| must be within 1% of total assets. */
const BALANCE_TOLERANCE = 0.01;

export function validateExtraction(
  statements: DetectedStatement[],
  figures: FiguresByYear,
): ValidationOutcome {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const found = new Set(statements.map((s) => s.type));
  for (const required of REQUIRED_STATEMENTS) {
    if (!found.has(required)) {
      errors.push({
        code: `MISSING_${required}`,
        message: `${STATEMENT_LABELS[required]} was not found in the document.`,
      });
    }
  }

  if (figures.size === 0) {
    errors.push({
      code: "NO_FISCAL_YEARS",
      message: "No fiscal-year columns with figures could be extracted.",
    });
    return { errors, warnings };
  }

  for (const [year, yearFigures] of [...figures.entries()].sort((a, b) => b[0] - a[0])) {
    const missing = CORE_KEYS.filter((k) => yearFigures[k] === undefined);
    if (missing.length > 0) {
      warnings.push({
        code: "MISSING_CORE_FIGURES",
        message: `FY${year}: could not extract ${missing.join(", ")}.`,
      });
    }

    const { totalAssets, totalLiabilities, totalEquity } = yearFigures;
    if (totalAssets && totalLiabilities && totalEquity) {
      const sum = addAmounts([totalLiabilities, totalEquity]);
      const diff = addAmounts([totalAssets, negate(sum)]);
      const tolerance = scaleAbs(totalAssets, BALANCE_TOLERANCE);
      if (compareAmounts(abs(diff), tolerance) > 0) {
        warnings.push({
          code: "BALANCE_MISMATCH",
          message: `FY${year}: assets (${totalAssets}) differ from liabilities + equity (${sum}) by more than ${BALANCE_TOLERANCE * 100}%.`,
        });
      }
    }
  }

  return { errors, warnings };
}

function negate(value: string): string {
  if (value === "0") return value;
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

function abs(value: string): string {
  return value.startsWith("-") ? value.slice(1) : value;
}

/** value × factor as a decimal string, exact enough for a tolerance bound. */
function scaleAbs(value: string, factor: number): string {
  // factor is a small power-of-ten fraction (0.01); shift the decimal point.
  const shift = Math.round(-Math.log10(factor));
  const [intPart, fracPart = ""] = abs(value).split(".");
  const digits = intPart + fracPart;
  const pointAt = intPart.length - shift;
  if (pointAt <= 0) return `0.${"0".repeat(-pointAt)}${digits}`;
  const head = digits.slice(0, pointAt).replace(/^0+(?=\d)/, "") || "0";
  const tail = digits.slice(pointAt).replace(/0+$/, "");
  return tail ? `${head}.${tail}` : head;
}
