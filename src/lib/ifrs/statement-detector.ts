/**
 * Detects which pages hold the four primary IFRS statements.
 *
 * A page qualifies when a statement heading appears near the top AND the
 * page actually contains financial rows — this skips tables of contents,
 * the auditor's report, and notes that merely mention statement names.
 */
import { AMOUNT_RE } from "@/lib/ifrs/amounts";

import type { DetectedStatement, PageText, StatementType } from "@/lib/ifrs/types";

const HEADING_PATTERNS: [StatementType, RegExp][] = [
  ["FINANCIAL_POSITION", /statement\s+of\s+financial\s+position|balance\s+sheet/i],
  [
    "PROFIT_OR_LOSS",
    /statement\s+of\s+(profit\s+or\s+loss|comprehensive\s+income|income)|income\s+statement/i,
  ],
  ["CASH_FLOWS", /statement\s+of\s+cash\s*flows?|cash\s*flows?\s+statement/i],
  ["CHANGES_IN_EQUITY", /statement\s+of\s+changes\s+in\s+(shareholders['’]?\s+)?equity/i],
];

const EXCLUDED_PAGE = /notes\s+to\s+the\s+(consolidated\s+)?financial\s+statements|independent\s+auditor|auditor['’]s\s+report|chairman['’]?s?\s+(message|statement)|table\s+of\s+contents|^\s*contents\s*$/im;

/** How many lines from the top of a page a heading may appear. */
const HEADING_WINDOW = 12;

/** Minimum number of lines carrying an amount for a page to count as a statement. */
const MIN_FINANCIAL_ROWS = 3;

function countFinancialRows(text: string): number {
  let rows = 0;
  for (const line of text.split("\n")) {
    const amounts = line.match(AMOUNT_RE) ?? [];
    // At least one 4+ digit amount — filters out note numbers and years-only lines.
    if (amounts.some((a) => a.replace(/\D/g, "").length >= 4)) rows++;
  }
  return rows;
}

export function detectStatements(pages: PageText[]): DetectedStatement[] {
  const detected = new Map<StatementType, number[]>();

  for (const page of pages) {
    if (EXCLUDED_PAGE.test(page.text)) continue;
    if (countFinancialRows(page.text) < MIN_FINANCIAL_ROWS) continue;

    const topLines = page.text.split("\n").slice(0, HEADING_WINDOW).join("\n");
    for (const [type, pattern] of HEADING_PATTERNS) {
      if (!pattern.test(topLines)) continue;
      if (!detected.has(type)) detected.set(type, [page.pageNumber]);
      break; // one statement type per page start
    }
  }

  // Statements can span two pages (e.g. assets / liabilities split): a page
  // with financial rows but NO heading directly after a detected page is a
  // continuation of that statement.
  for (const [type, pageNumbers] of detected) {
    const next = pages.find((p) => p.pageNumber === pageNumbers[0] + 1);
    if (!next || EXCLUDED_PAGE.test(next.text)) continue;
    const topLines = next.text.split("\n").slice(0, HEADING_WINDOW).join("\n");
    const hasOwnHeading = HEADING_PATTERNS.some(([, pattern]) => pattern.test(topLines));
    if (!hasOwnHeading && countFinancialRows(next.text) >= MIN_FINANCIAL_ROWS) {
      detected.set(type, [...pageNumbers, next.pageNumber]);
    }
  }

  return [...detected.entries()].map(([type, pageNumbers]) => ({ type, pages: pageNumbers }));
}
