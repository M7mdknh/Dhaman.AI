/**
 * FinancialIntegrityValidator — the gate between extraction and the Financial
 * Intelligence Engine. Runs on the persisted FinancialStatement rows the
 * moment extraction produces them, and again at the engine's own door, so
 * arithmetically impossible figures can never reach a ratio, a score, or a
 * recommendation.
 *
 * Pure and deterministic: Decimal in, findings out. No I/O, no AI, no
 * thresholds of its own (they live in thresholds.ts).
 *
 * SCOPE — this validator answers exactly one question:
 *
 *     "Can these numbers be what the auditor actually printed?"
 *
 * It does NOT answer "is this company creditworthy?". Negative equity, a net
 * loss, negative operating cash flow and collapsing revenue are all VALID
 * data describing a distressed applicant — precisely the applicant a bank
 * most needs assessed. Judging them is the risk engine's job. Blocking here
 * would hide the very cases underwriting exists to catch, so this file is
 * careful to reject only what is impossible, never what is merely bad.
 *
 * A BLOCKING finding rejects one FISCAL YEAR, not the case. A case with one
 * unusable year and one good year is still underwritten on the good year —
 * the same "never fail the whole case for one bad part" rule the document
 * pipeline follows. Only when NO year survives does the engine receive
 * nothing and the case stop.
 */
import { Decimal, ratio } from "@/lib/finance/decimal";
import { INTEGRITY } from "@/lib/finance/thresholds";
import { formatMoneyWhole } from "@/lib/format";

import type { DecimalValue } from "@/lib/finance/decimal";
import type { FinancialStatement } from "@/generated/prisma/client";

export type IntegritySeverity = "BLOCKING" | "WARNING" | "INFO";

export interface IntegrityFinding {
  /** Stable machine code — safe to assert on and to log. */
  code: string;
  severity: IntegritySeverity;
  /** The year the finding concerns; null when it is about the case overall. */
  fiscalYear: number | null;
  /** Plain English: what is wrong and what it implies. Shown to humans. */
  message: string;
}

export interface IntegrityReport {
  /** False when no fiscal year survived — the engine must not run at all. */
  ok: boolean;
  findings: IntegrityFinding[];
  /** Fiscal years safe to compute on, newest first. */
  usableYears: number[];
  /** Fiscal years withheld from the engine, newest first. */
  rejectedYears: number[];
}

/**
 * The figures an underwriting assessment cannot be built without. A year
 * missing any of them yields ratios so partial that a score would be
 * misleading, so the year is withheld rather than half-assessed.
 */
const CORE_FIGURES = [
  "revenue",
  "netIncome",
  "totalAssets",
  "totalLiabilities",
  "totalEquity",
  "operatingCashFlow",
] as const satisfies readonly (keyof FinancialStatement)[];

/**
 * Figures that cannot be negative in any real statement. Equity, net income,
 * gross profit, operating income and the three cash flows are all legitimately
 * negative and are deliberately absent. COGS, finance costs and capex are
 * printed with either sign by different auditors (the engine takes their
 * magnitude), so their sign carries no information and is not checked.
 */
const NEVER_NEGATIVE = [
  "revenue",
  "cash",
  "receivables",
  "inventory",
  "currentAssets",
  "totalAssets",
  "currentLiabilities",
  "totalLiabilities",
  "shortTermDebt",
  "longTermDebt",
  "totalDebt",
] as const satisfies readonly (keyof FinancialStatement)[];

const LABEL: Record<string, string> = {
  revenue: "Revenue",
  netIncome: "Net Income",
  cash: "Cash",
  receivables: "Receivables",
  inventory: "Inventory",
  currentAssets: "Total Current Assets",
  totalAssets: "Total Assets",
  currentLiabilities: "Total Current Liabilities",
  totalLiabilities: "Total Liabilities",
  totalEquity: "Total Equity",
  shortTermDebt: "Short-term Debt",
  longTermDebt: "Long-term Debt",
  totalDebt: "Total Debt",
  operatingCashFlow: "Operating Cash Flow",
};

/** Reads a Decimal column off a row (all money columns are Decimal | null). */
function figure(row: FinancialStatement, key: string): DecimalValue | null {
  return (row as unknown as Record<string, DecimalValue | null>)[key] ?? null;
}

/**
 * Money as a banker reads it: "SAR 50,000,000", and negatives in accounting
 * parentheses. Whole units — a gap large enough to be reported here is never
 * a matter of cents, and the extra digits only cost the reader.
 *
 * Presentation only. Every finding's severity, and the decision to raise it,
 * is computed from Decimal values above and is unaffected by this.
 */
function money(value: DecimalValue, currency: string): string {
  return formatMoneyWhole(value, currency);
}

export function validateFinancialIntegrity(statements: FinancialStatement[]): IntegrityReport {
  const findings: IntegrityFinding[] = [];
  const rejected = new Set<number>();

  const reject = (fiscalYear: number, code: string, message: string) => {
    rejected.add(fiscalYear);
    findings.push({ code, severity: "BLOCKING", fiscalYear, message });
  };
  const warn = (fiscalYear: number | null, code: string, message: string) =>
    findings.push({ code, severity: "WARNING", fiscalYear, message });
  const inform = (fiscalYear: number | null, code: string, message: string) =>
    findings.push({ code, severity: "INFO", fiscalYear, message });

  if (statements.length === 0) {
    return {
      ok: false,
      findings: [
        {
          code: "NO_STATEMENTS",
          severity: "BLOCKING",
          fiscalYear: null,
          message: "No financial statements were extracted, so no assessment can be produced.",
        },
      ],
      usableYears: [],
      rejectedYears: [],
    };
  }

  // ---- Case-level: fiscal-year integrity -----------------------------------
  // A duplicate year would mean two contradictory truths for one period. The
  // database's unique(caseId, fiscalYear) already forbids it; checked anyway
  // because this validator also runs on in-memory rows before they are stored.
  const seen = new Set<number>();
  for (const row of statements) {
    if (seen.has(row.fiscalYear)) {
      reject(
        row.fiscalYear,
        "DUPLICATE_FISCAL_YEAR",
        `FY${row.fiscalYear} was extracted more than once — the same period cannot hold two different sets of figures.`,
      );
    }
    seen.add(row.fiscalYear);
  }

  // ---- Case-level: one currency --------------------------------------------
  // Ratios and trends compare years against each other; two currencies in one
  // series compares quantities that are not the same kind of thing.
  const currencies = [...new Set(statements.map((s) => s.currency))];
  if (currencies.length > 1) {
    for (const row of statements) {
      reject(
        row.fiscalYear,
        "CURRENCY_INCONSISTENT",
        `The statements mix currencies (${currencies.join(", ")}) — figures from different currencies cannot be compared or trended.`,
      );
    }
  }

  // ---- Per-year checks ------------------------------------------------------
  for (const row of statements) {
    const year = row.fiscalYear;

    // Missing CORE figures.
    const missing = CORE_FIGURES.filter((key) => figure(row, key) === null);
    if (missing.length > 0) {
      reject(
        year,
        "MISSING_CORE_FIGURES",
        `FY${year} is missing ${missing.map((k) => LABEL[k]).join(", ")} — an underwriting assessment cannot be built without ${missing.length === 1 ? "it" : "them"}.`,
      );
    }

    // Impossible signs.
    for (const key of NEVER_NEGATIVE) {
      const value = figure(row, key);
      if (value !== null && value.isNegative()) {
        reject(
          year,
          "IMPOSSIBLE_NEGATIVE",
          `FY${year}: ${LABEL[key]} reads ${money(value, row.currency)}, which cannot be negative in an audited statement — the figure was almost certainly read from the wrong line.`,
        );
      }
    }

    const totalAssets = figure(row, "totalAssets");
    const totalLiabilities = figure(row, "totalLiabilities");
    const totalEquity = figure(row, "totalEquity");
    const currentAssets = figure(row, "currentAssets");
    const currentLiabilities = figure(row, "currentLiabilities");
    const revenue = figure(row, "revenue");
    const netIncome = figure(row, "netIncome");
    const cash = figure(row, "cash");

    // A subtotal cannot exceed the total that contains it.
    if (currentAssets && totalAssets && currentAssets.gt(totalAssets)) {
      reject(
        year,
        "SUBTOTAL_EXCEEDS_TOTAL",
        `FY${year}: current assets of ${money(currentAssets, row.currency)} exceed total assets of ${money(totalAssets, row.currency)} — one of the two was mapped from the wrong line.`,
      );
    }
    if (currentLiabilities && totalLiabilities && currentLiabilities.gt(totalLiabilities)) {
      reject(
        year,
        "SUBTOTAL_EXCEEDS_TOTAL",
        `FY${year}: current liabilities of ${money(currentLiabilities, row.currency)} exceed total liabilities of ${money(totalLiabilities, row.currency)} — one of the two was mapped from the wrong line.`,
      );
    }
    if (cash && currentAssets && cash.gt(currentAssets)) {
      reject(
        year,
        "SUBTOTAL_EXCEEDS_TOTAL",
        `FY${year}: cash of ${money(cash, row.currency)} exceeds total current assets of ${money(currentAssets, row.currency)}, which contains it — one of the two was mapped from the wrong line.`,
      );
    }

    // The accounting identity. A real audited balance sheet always balances;
    // a break means a figure came off the wrong row — most often the
    // "Total equity and liabilities" grand total claimed as one component.
    if (totalAssets && totalLiabilities && totalEquity) {
      const sum = totalLiabilities.add(totalEquity);
      const drift = totalAssets.sub(sum).abs();
      const allowed = totalAssets.abs().mul(INTEGRITY.balanceTolerance);
      if (drift.gt(allowed)) {
        const identityGrab =
          totalEquity.eq(totalAssets) && totalLiabilities.gt(0)
            ? " Total equity exactly equals total assets, which is the signature of the balance-sheet grand total being read as equity."
            : "";
        reject(
          year,
          "BALANCE_SHEET_DOES_NOT_BALANCE",
          `FY${year}: total assets of ${money(totalAssets, row.currency)} do not equal liabilities plus equity of ${money(sum, row.currency)} — a gap of ${money(drift, row.currency)}, beyond the ${INTEGRITY.balanceTolerance * 100}% tolerance. The figures cannot all be from the same balance sheet.${identityGrab}`,
        );
      }
    }

    // Implausible magnitude between two figures that must be related.
    if (revenue && netIncome && revenue.gt(0)) {
      const limit = revenue.mul(INTEGRITY.netIncomeToRevenueMax);
      if (netIncome.abs().gt(limit)) {
        warn(
          year,
          "NET_INCOME_IMPLAUSIBLE_VS_REVENUE",
          `FY${year}: net income of ${money(netIncome, row.currency)} is more than ${INTEGRITY.netIncomeToRevenueMax}× revenue of ${money(revenue, row.currency)} — verify both were read from the correct lines before relying on the margins.`,
        );
      }
    }

    // A current ratio this extreme is a denominator problem, not liquidity.
    const currentRatio = ratio(currentAssets, currentLiabilities);
    if (currentRatio !== null && currentRatio > INTEGRITY.currentRatioMax) {
      warn(
        year,
        "RATIO_IMPLAUSIBLE",
        `FY${year}: the current ratio computes to ${Math.round(currentRatio).toLocaleString("en")}:1 — current liabilities of ${currentLiabilities ? money(currentLiabilities, row.currency) : "n/a"} look mis-read rather than genuinely near zero.`,
      );
    }
  }

  // ---- Case-level: scale consistency across years --------------------------
  // Checked on years that are otherwise sound, so a rejected year cannot
  // trigger a misleading scale warning about a good one.
  const sound = statements
    .filter((s) => !rejected.has(s.fiscalYear))
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
  for (let i = 1; i < sound.length; i++) {
    const prior = figure(sound[i - 1], "totalAssets");
    const current = figure(sound[i], "totalAssets");
    if (!prior || !current || prior.isZero() || current.isZero()) continue;
    const jump = current.div(prior).abs();
    const inverse = new Decimal(1).div(jump);
    if (jump.gt(INTEGRITY.scaleJumpFactor) || inverse.gt(INTEGRITY.scaleJumpFactor)) {
      warn(
        sound[i].fiscalYear,
        "SCALE_INCONSISTENT",
        `Total assets move from ${money(prior, sound[i - 1].currency)} in FY${sound[i - 1].fiscalYear} to ${money(current, sound[i].currency)} in FY${sound[i].fiscalYear} — a ${(jump.gt(1) ? jump : inverse).toFixed(0)}× change that usually means one year was read in different units (thousands vs units). Trends across these years are unreliable.`,
      );
    }
  }

  // ---- Informational -------------------------------------------------------
  const usableYears = statements
    .map((s) => s.fiscalYear)
    .filter((y) => !rejected.has(y))
    .sort((a, b) => b - a);

  if (usableYears.length === 1) {
    inform(
      usableYears[0],
      "SINGLE_YEAR_ONLY",
      `Only FY${usableYears[0]} is available — the assessment is a point-in-time view with no trend analysis.`,
    );
  }
  for (let i = 1; i < usableYears.length; i++) {
    const gap = usableYears[i - 1] - usableYears[i];
    if (gap > 1) {
      inform(
        null,
        "FISCAL_YEAR_GAP",
        `FY${usableYears[i]} and FY${usableYears[i - 1]} are not consecutive — year-on-year trends span a ${gap}-year gap.`,
      );
    }
  }
  if (rejected.size > 0 && usableYears.length > 0) {
    inform(
      null,
      "PARTIAL_YEARS_WITHHELD",
      `The assessment uses ${usableYears.map((y) => `FY${y}`).join(", ")}; ${[...rejected].sort((a, b) => b - a).map((y) => `FY${y}`).join(", ")} did not pass integrity checks and ${rejected.size === 1 ? "was" : "were"} excluded.`,
    );
  }

  return {
    ok: usableYears.length > 0,
    findings,
    usableYears,
    rejectedYears: [...rejected].sort((a, b) => b - a),
  };
}

/** The statements safe to hand the engine, per the report. */
export function usableStatements(
  statements: FinancialStatement[],
  report: IntegrityReport,
): FinancialStatement[] {
  return statements.filter((s) => report.usableYears.includes(s.fiscalYear));
}

/**
 * The case-failure reason shown to a human. States what is wrong and why,
 * then what to do about it — a reader must never be left with a dead end.
 * The cause is nearly always the document (a layout the reader mis-tracked),
 * never something the applicant did wrong, so the wording says so.
 */
export function blockingSummary(report: IntegrityReport): string {
  const blocking = report.findings.filter((f) => f.severity === "BLOCKING");
  if (blocking.length === 0) return "";
  // The same reason repeated per year reads as noise — collapse to distinct text.
  const reasons = [...new Set(blocking.map((f) => f.message))].join(" ");
  return `${reasons} The figures were most likely read from the wrong rows of the uploaded document. Upload the standalone audited financial statements issued by the auditor and the analysis will run again.`;
}
