/**
 * Label normalization: maps printed IFRS line-item labels to the canonical
 * figure keys stored on FinancialStatement. Deterministic regex synonym
 * table — first matching rule wins, evaluated in table order (most specific
 * patterns first). Unmapped labels keep normalizedKey = null and remain in
 * provenance untouched.
 *
 * The parser never calculates: derivable figures (EBITDA, total debt) are
 * mapped only when literally printed; derivation is the analysis engine's
 * job (documented in docs/FINANCIAL_ENGINE.md).
 */
import type { ExtractedLineItem, StatementType } from "@/lib/ifrs/types";

/** Canonical keys — exactly the FinancialStatement figure columns. */
export const CANONICAL_KEYS = [
  "revenue",
  "cogs",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "ebitda",
  "interestExpense",
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
  "totalEquity",
  "operatingCashFlow",
  "investingCashFlow",
  "financingCashFlow",
  "capex",
  "annualDebtService",
] as const;

export type CanonicalKey = (typeof CANONICAL_KEYS)[number];

interface MappingRule {
  key: CanonicalKey;
  /** Statements this rule applies to (labels are ambiguous across statements). */
  statements: StatementType[];
  pattern: RegExp;
}

const PL: StatementType[] = ["PROFIT_OR_LOSS"];
const BS: StatementType[] = ["FINANCIAL_POSITION"];
const CF: StatementType[] = ["CASH_FLOWS"];

/**
 * Order matters: specific before generic ("total current assets" must win
 * before any "total assets" rule could see the line). All patterns are
 * matched against the lower-cased label anchored at the start.
 */
const RULES: MappingRule[] = [
  // ---- Statement of Profit or Loss
  { key: "cogs", statements: PL, pattern: /^cost of (revenue|sales|goods sold|contract)/ },
  { key: "grossProfit", statements: PL, pattern: /^gross (profit|margin)\b/ },
  { key: "operatingIncome", statements: PL, pattern: /^(operating (profit|income)|profit from operations|results from operating activities)/ },
  { key: "ebitda", statements: PL, pattern: /^ebitda\b/ },
  { key: "interestExpense", statements: PL, pattern: /^(finance (costs?|expenses?)|interest expense|borrowing costs?)/ },
  { key: "netIncome", statements: PL, pattern: /^(net (profit|income)|profit (for the (year|period))|profit attributable to|profit after (zakat|tax))/ },
  { key: "revenue", statements: PL, pattern: /^(revenue|sales|turnover|contract revenue)\b/ },

  // ---- Statement of Financial Position — assets
  { key: "cash", statements: BS, pattern: /^(cash and (cash )?equivalents?|cash and bank balances|bank balances and cash|cash at banks?)/ },
  { key: "receivables", statements: BS, pattern: /^(trade (and other )?receivables|accounts? receivables?|contract receivables)/ },
  { key: "inventory", statements: BS, pattern: /^(inventor(y|ies)|stock\b)/ },
  { key: "currentAssets", statements: BS, pattern: /^total current assets/ },
  { key: "totalAssets", statements: BS, pattern: /^total assets/ },

  // ---- Statement of Financial Position — liabilities & equity
  { key: "currentLiabilities", statements: BS, pattern: /^total current liabilit/ },
  { key: "totalLiabilities", statements: BS, pattern: /^total liabilit/ },
  { key: "shortTermDebt", statements: BS, pattern: /^(short.?term (borrowings|debt|loans)|current portion of (long.?term|term) (debt|loans|borrowings)|bank overdrafts?)/ },
  { key: "longTermDebt", statements: BS, pattern: /^(long.?term (borrowings|debt|loans)|term loans?\b|non.?current borrowings)/ },
  { key: "totalDebt", statements: BS, pattern: /^total (debt|borrowings)/ },
  { key: "totalEquity", statements: BS, pattern: /^total (shareholders['’]? )?equity/ },
  { key: "annualDebtService", statements: BS, pattern: /^annual debt service/ },

  // ---- Statement of Cash Flows
  { key: "operatingCashFlow", statements: CF, pattern: /^net cash (flows? )?(generated |used )?(from|in) operating activities/ },
  { key: "investingCashFlow", statements: CF, pattern: /^net cash (flows? )?(generated |used )?(from|in) investing activities/ },
  { key: "financingCashFlow", statements: CF, pattern: /^net cash (flows? )?(generated |used )?(from|in) financing activities/ },
  { key: "capex", statements: CF, pattern: /^(purchases? of property,? plant and equipment|additions? to property,? plant|acquisition of property,? plant|capital expenditures?)/ },
];

/** Where a key is read from when several statements carry it (first hit wins). */
const KEY_HOME: Record<CanonicalKey, StatementType[]> = Object.fromEntries(
  CANONICAL_KEYS.map((key) => [
    key,
    RULES.filter((r) => r.key === key).flatMap((r) => r.statements),
  ]),
) as Record<CanonicalKey, StatementType[]>;

export function normalizeLabel(statement: StatementType, label: string): CanonicalKey | null {
  const normalized = label.toLowerCase().trim();
  for (const rule of RULES) {
    if (!rule.statements.includes(statement)) continue;
    if (rule.pattern.test(normalized)) return rule.key;
  }
  return null;
}

/** Fills normalizedKey on every line item (returns new objects; input untouched). */
export function normalizeLineItems(items: ExtractedLineItem[]): ExtractedLineItem[] {
  return items.map((item) => ({
    ...item,
    normalizedKey: normalizeLabel(item.statement, item.originalLabel),
  }));
}

export type FiguresByYear = Map<number, Partial<Record<CanonicalKey, string>>>;

/**
 * Collapses normalized line items into one figure set per fiscal year.
 * Per (key, year): the key's home statement wins, and within a statement the
 * FIRST occurrence wins (statements print the headline row before details).
 */
export function figuresByYear(items: ExtractedLineItem[]): FiguresByYear {
  const byYear: FiguresByYear = new Map();

  for (const key of CANONICAL_KEYS) {
    for (const home of KEY_HOME[key]) {
      const item = items.find((i) => i.normalizedKey === key && i.statement === home);
      if (!item) continue;
      for (const value of item.values) {
        const figures = byYear.get(value.fiscalYear) ?? {};
        if (!(key in figures)) figures[key] = value.normalized;
        byYear.set(value.fiscalYear, figures);
      }
      break; // home statement found — don't fall through to lower-priority ones
    }
  }
  return byYear;
}
