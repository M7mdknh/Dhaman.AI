/**
 * Label normalization: maps printed IFRS line-item labels (English or Arabic)
 * to the canonical figure keys stored on FinancialStatement. Deterministic —
 * first matching rule wins, evaluated in table order (most specific first).
 * Unmapped labels keep normalizedKey = null and remain in provenance untouched.
 *
 * The parser never calculates: derivable figures are mapped only when literally
 * printed; derivation is the analysis engine's job.
 */
import { matchesArabicGroups, normalizeArabic } from "@/lib/ifrs/vocab";

import type { ExtractedLineItem, StatementType } from "@/lib/ifrs/types";

export const CANONICAL_KEYS = [
  "revenue",
  "cogs",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "ebitda",
  "depreciationAmortization",
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

/**
 * The minimum figures an underwriting package needs to be actionable. The
 * parser still extracts the full canonical set (the financial-intelligence
 * engine consumes all of it — margins, liquidity, leverage, coverage), but a
 * fiscal year that carries every CORE figure is "underwritable" — used to log
 * completeness and to reason about a fast-path without re-reading the document.
 */
export const CORE_FIGURE_KEYS = [
  "revenue",
  "netIncome",
  "cash",
  "totalAssets",
  "totalLiabilities",
  "totalEquity",
  "operatingCashFlow",
  "totalDebt",
] as const satisfies readonly CanonicalKey[];

/** Count of CORE figures present in the newest fiscal year (0-8). */
export function coreFigureCoverage(figures: FiguresByYear): number {
  const newest = [...figures.keys()].sort((a, b) => b - a)[0];
  if (newest === undefined) return 0;
  const year = figures.get(newest) ?? {};
  return CORE_FIGURE_KEYS.filter((key) => year[key] !== undefined).length;
}

interface MappingRule {
  key: CanonicalKey;
  statements: StatementType[];
  /** English pattern (matched against the lower-cased label). */
  pattern: RegExp;
  /** Arabic keyword groups (matched against the diacritic-normalized label). */
  ar?: string[][];
  /**
   * Arabic disqualifiers: if any token appears, the rule declines the label.
   * Arabic matching is unanchored substring containment, so a combined caption
   * ("إجمالي المطلوبات وحقوق الملكية" — total liabilities AND equity) otherwise
   * satisfies the liabilities group and steals the balance-sheet grand total.
   */
  arNot?: string[];
}

const PL: StatementType[] = ["PROFIT_OR_LOSS"];
const BS: StatementType[] = ["FINANCIAL_POSITION"];
const CF: StatementType[] = ["CASH_FLOWS"];

/**
 * One bottom-line outcome word. IFRS prints the same figure as "profit",
 * "income", "loss" or "earnings", and the parentheses in "(loss)" are
 * typography — not a different number.
 */
const PL_WORD = String.raw`\(?\s*(?:profit|income|loss|earnings)\s*\)?`;

/**
 * An outcome word or a slash form covering both outcomes: "Profit / (loss)",
 * "Net (loss) / profit". Supporting loss wording is not optional — a bank most
 * needs to catch the applicants whose bottom line IS a loss, and dropping the
 * figure there would silently hand the engine an incomplete year.
 */
const PL_COMBO = `${PL_WORD}(?:\\s*/\\s*${PL_WORD})?`;

/**
 * A bare outcome word is far too broad to stand alone ("Income tax expense",
 * "Loss on disposal of equipment" are NOT the bottom line), so an unprefixed
 * caption must carry a qualifier that only the bottom line uses.
 */
const PL_QUALIFIER = String.raw`(?:for the (?:year|period)|after (?:zakat|tax)|attributable to)`;

/** Specific rules precede generic: "total current assets" before "total assets". */
const RULES: MappingRule[] = [
  // ---- Statement of Profit or Loss
  { key: "cogs", statements: PL, pattern: /^(cost of (revenues?|sales|goods sold|contract)|direct costs?\b)/, ar: [["تكلفه", "الايرادات"], ["تكلفه", "المبيعات"]] },
  { key: "grossProfit", statements: PL, pattern: new RegExp(`^gross\\s+(?:${PL_COMBO}|margin)\\b`), ar: [["اجمالي", "الربح"], ["مجمل", "الربح"], ["مجمل", "الخساره"]] },
  { key: "operatingIncome", statements: PL, pattern: new RegExp(`^(?:operating\\s+${PL_COMBO}|${PL_COMBO}\\s+from operations|results from operating activities)`), ar: [["الربح", "التشغيلي"], ["الربح", "العمليات"], ["الخساره", "التشغيليه"]] },
  { key: "ebitda", statements: PL, pattern: /^ebitda\b/ },
  { key: "interestExpense", statements: PL, pattern: /^(finance (costs?|expenses?)|funding costs?|interest expense|borrowing costs?)/, ar: [["تكاليف", "التمويل"], ["تكاليف", "تمويل"]] },
  // "Net <outcome>" is self-qualifying; a bare outcome word needs a qualifier
  // so "Income tax expense" / "Loss on disposal" can never pose as the bottom line.
  { key: "netIncome", statements: PL, pattern: new RegExp(`^(?:net\\s+${PL_COMBO}|${PL_COMBO}\\s+${PL_QUALIFIER})`), ar: [["صافي", "الربح"], ["صافي", "الدخل"], ["صافي", "الخساره"], ["ربح", "السنه"], ["ربح", "الفتره"], ["خساره", "السنه"], ["خساره", "الفتره"]] },
  // "sales" alone is a revenue caption, but "Sales and marketing expenses" is a cost.
  { key: "revenue", statements: PL, pattern: /^(?:total\s+|net\s+|operating\s+)?(?:revenues?|turnover|contract revenues?|sales(?!\s+and\s+(?:marketing|distribution))(?!\s+expenses?))\b/, ar: [["الايرادات"], ["ايرادات"], ["اجمالي", "الايرادات"], ["المبيعات"]] },

  // ---- Statement of Financial Position - assets
  { key: "cash", statements: BS, pattern: /^(cash and (cash )?equivalents?|cash and bank balances|bank balances and cash|cash at banks?|cash and short.?term deposits?|cash (on|in) hand and at banks?)/, ar: [["النقد", "حكمه"], ["النقد", "يعادل"], ["النقديه", "النقديه"], ["نقد", "بنك"]] },
  { key: "receivables", statements: BS, pattern: /^(trade (and other )?receivables|accounts? receivables?|contract receivables|consumer receivables|financing receivables|trade debtors?)/, ar: [["ذمم", "مدينه"], ["المدينون"]] },
  { key: "inventory", statements: BS, pattern: /^(inventor(y|ies)|stock\b)/, ar: [["المخزون"], ["البضاعه"]] },
  // Some classified balance sheets subtotal with the bare "Current assets"
  // caption instead of "Total current assets" — accept either, but only as
  // a COMPLETE caption (anchored to end) so a specific line item like
  // "Current assets held for sale" is never mistaken for the subtotal.
  { key: "currentAssets", statements: BS, pattern: /^(total current assets|current assets\s*:?\s*$)/, ar: [["اجمالي", "الموجودات", "المتداوله"], ["مجموع", "الموجودات", "المتداوله"], ["اجمالي", "الاصول", "المتداوله"]] },
  { key: "totalAssets", statements: BS, pattern: /^total assets/, ar: [["اجمالي", "الموجودات"], ["مجموع", "الموجودات"], ["اجمالي", "الاصول"], ["مجموع", "الاصول"]] },

  // ---- Statement of Financial Position - liabilities & equity
  { key: "currentLiabilities", statements: BS, pattern: /^(total current liabilit\w*|current liabilities?\s*:?\s*$)/, ar: [["اجمالي", "المطلوبات", "المتداوله"], ["مجموع", "المطلوبات", "المتداوله"], ["اجمالي", "الخصوم", "المتداوله"]] },
  // "Total liabilities and equity" is the balance-sheet GRAND TOTAL (it equals
  // total assets), not liabilities — claiming it would inflate every leverage
  // ratio. Decline any caption naming both sides of the identity.
  { key: "totalLiabilities", statements: BS, pattern: /^total liabilit(?!.*\bequity)/, ar: [["اجمالي", "المطلوبات"], ["مجموع", "المطلوبات"], ["اجمالي", "الخصوم"], ["مجموع", "الخصوم"]], arNot: ["حقوق"] },
  { key: "shortTermDebt", statements: BS, pattern: /^(short.?term (borrowings|debt|loans)|current portion of (long.?term|term) (debt|loans|borrowings)|bank overdrafts?)/, ar: [["قروض", "قصيره"], ["الجزء", "المتداول", "قروض"]] },
  { key: "longTermDebt", statements: BS, pattern: /^(long.?term (borrowings|debt|loans)|term loans?\b|non.?current borrowings)/, ar: [["قروض", "طويله"], ["قروض", "اجل"]] },
  { key: "totalDebt", statements: BS, pattern: /^total (debt|borrowings)/, ar: [["اجمالي", "القروض"], ["اجمالي", "الديون"]] },
  // Mirror of the guard above: "Total equity and liabilities" is the grand total.
  { key: "totalEquity", statements: BS, pattern: /^total ((share|stock)holders?['’]?s? )?equity(?!.*\bliabilit)/, ar: [["اجمالي", "حقوق", "الملكيه"], ["مجموع", "حقوق", "الملكيه"], ["اجمالي", "حقوق", "المساهمين"], ["مجموع", "حقوق", "المساهمين"]], arNot: ["المطلوبات", "الخصوم"] },
  { key: "annualDebtService", statements: BS, pattern: /^annual debt service/ },

  // ---- Statement of Cash Flows
  // "net" is optional and "provided by" is as common as "generated from" —
  // a bare "Cash flows from operating activities" section heading carries no
  // amounts, so it never becomes a line item and cannot shadow the subtotal.
  // The operating-activities reconciliation add-back — used to derive EBITDA
  // (operatingIncome + D&A) when a statement never prints an "EBITDA" line,
  // which is the common case (EBITDA is a non-IFRS metric).
  { key: "depreciationAmortization", statements: CF, pattern: /^depreciation(?:\s*(?:and|&)\s*amortization)?\b/, ar: [["الاستهلاك", "الاطفاء"], ["استهلاك", "اطفاء"]] },
  { key: "operatingCashFlow", statements: CF, pattern: /^(net )?cash (flows? )?(generated |used |provided )?(from|in|by) operating activit/, ar: [["صافي", "النقد", "التشغيليه"], ["النقد", "الانشطه", "التشغيليه"]] },
  { key: "investingCashFlow", statements: CF, pattern: /^(net )?cash (flows? )?(generated |used |provided )?(from|in|by) investing activit/, ar: [["صافي", "النقد", "الاستثماريه"], ["النقد", "الانشطه", "الاستثماريه"]] },
  { key: "financingCashFlow", statements: CF, pattern: /^(net )?cash (flows? )?(generated |used |provided )?(from|in|by) financing activit/, ar: [["صافي", "النقد", "التمويليه"], ["النقد", "الانشطه", "التمويليه"]] },
  { key: "capex", statements: CF, pattern: /^(purchases? of property(,? plant)? and equipment|additions? to property,? plant|acquisition of property,? plant|capital expenditures?)/, ar: [["شراء", "ممتلكات"], ["اضافات", "ممتلكات"]] },
];

/** The statement(s) each canonical key is sourced from (its "home"). */
export const KEY_HOME: Record<CanonicalKey, StatementType[]> = Object.fromEntries(
  CANONICAL_KEYS.map((key) => [key, RULES.filter((r) => r.key === key).flatMap((r) => r.statements)]),
) as Record<CanonicalKey, StatementType[]>;

export function normalizeLabel(statement: StatementType, label: string): CanonicalKey | null {
  const en = label.toLowerCase().trim();
  const ar = normalizeArabic(label);
  for (const rule of RULES) {
    if (!rule.statements.includes(statement)) continue;
    if (rule.pattern.test(en)) return rule.key;
    if (!rule.ar || !matchesArabicGroups(ar, rule.ar)) continue;
    if (rule.arNot?.some((tok) => ar.includes(normalizeArabic(tok)))) continue;
    return rule.key;
  }
  return null;
}

export function normalizeLineItems(items: ExtractedLineItem[]): ExtractedLineItem[] {
  return items.map((item) => ({
    ...item,
    normalizedKey: normalizeLabel(item.statement, item.originalLabel),
  }));
}

export type FiguresByYear = Map<number, Partial<Record<CanonicalKey, string>>>;

/**
 * Collapses normalized line items into one figure set per fiscal year.
 * Per (key, year): the key's home statement wins, first occurrence within it —
 * EXCEPT on the statement of cash flows, where intermediate subtotals repeat
 * the caption ("Net cash used in operating activities" before and after EOSB /
 * finance / tax payments) and the statement total is always the LAST one.
 */
export function figuresByYear(items: ExtractedLineItem[]): FiguresByYear {
  const byYear: FiguresByYear = new Map();
  for (const key of CANONICAL_KEYS) {
    for (const home of KEY_HOME[key]) {
      const matches = items.filter((i) => i.normalizedKey === key && i.statement === home);
      const item = home === "CASH_FLOWS" ? matches.at(-1) : matches[0];
      if (!item) continue;
      for (const value of item.values) {
        const figures = byYear.get(value.fiscalYear) ?? {};
        if (!(key in figures)) figures[key] = value.normalized;
        byYear.set(value.fiscalYear, figures);
      }
      break;
    }
  }
  return byYear;
}
