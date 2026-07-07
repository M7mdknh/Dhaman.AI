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
  statements: StatementType[];
  /** English pattern (matched against the lower-cased label). */
  pattern: RegExp;
  /** Arabic keyword groups (matched against the diacritic-normalized label). */
  ar?: string[][];
}

const PL: StatementType[] = ["PROFIT_OR_LOSS"];
const BS: StatementType[] = ["FINANCIAL_POSITION"];
const CF: StatementType[] = ["CASH_FLOWS"];

/** Specific rules precede generic: "total current assets" before "total assets". */
const RULES: MappingRule[] = [
  // ---- Statement of Profit or Loss
  { key: "cogs", statements: PL, pattern: /^cost of (revenue|sales|goods sold|contract)/, ar: [["تكلفه", "الايرادات"], ["تكلفه", "المبيعات"]] },
  { key: "grossProfit", statements: PL, pattern: /^gross (profit|margin)\b/, ar: [["اجمالي", "الربح"], ["مجمل", "الربح"]] },
  { key: "operatingIncome", statements: PL, pattern: /^(operating (profit|income)|profit from operations|results from operating activities)/, ar: [["الربح", "التشغيلي"], ["الربح", "العمليات"]] },
  { key: "ebitda", statements: PL, pattern: /^ebitda\b/ },
  { key: "interestExpense", statements: PL, pattern: /^(finance (costs?|expenses?)|interest expense|borrowing costs?)/, ar: [["تكاليف", "التمويل"], ["تكاليف", "تمويل"]] },
  { key: "netIncome", statements: PL, pattern: /^(net (profit|income)|profit (for the (year|period))|profit attributable to|profit after (zakat|tax))/, ar: [["صافي", "الربح"], ["صافي", "الدخل"], ["ربح", "السنه"], ["ربح", "الفتره"]] },
  { key: "revenue", statements: PL, pattern: /^(revenue|sales|turnover|contract revenue)\b/, ar: [["الايرادات"], ["ايرادات"]] },

  // ---- Statement of Financial Position - assets
  { key: "cash", statements: BS, pattern: /^(cash and (cash )?equivalents?|cash and bank balances|bank balances and cash|cash at banks?)/, ar: [["النقد", "حكمه"], ["النقد", "يعادل"], ["النقديه", "النقديه"], ["نقد", "بنك"]] },
  { key: "receivables", statements: BS, pattern: /^(trade (and other )?receivables|accounts? receivables?|contract receivables)/, ar: [["ذمم", "مدينه"], ["المدينون"]] },
  { key: "inventory", statements: BS, pattern: /^(inventor(y|ies)|stock\b)/, ar: [["المخزون"], ["البضاعه"]] },
  { key: "currentAssets", statements: BS, pattern: /^total current assets/, ar: [["اجمالي", "الموجودات", "المتداوله"], ["مجموع", "الموجودات", "المتداوله"], ["اجمالي", "الاصول", "المتداوله"]] },
  { key: "totalAssets", statements: BS, pattern: /^total assets/, ar: [["اجمالي", "الموجودات"], ["مجموع", "الموجودات"], ["اجمالي", "الاصول"], ["مجموع", "الاصول"]] },

  // ---- Statement of Financial Position - liabilities & equity
  { key: "currentLiabilities", statements: BS, pattern: /^total current liabilit/, ar: [["اجمالي", "المطلوبات", "المتداوله"], ["مجموع", "المطلوبات", "المتداوله"], ["اجمالي", "الخصوم", "المتداوله"]] },
  { key: "totalLiabilities", statements: BS, pattern: /^total liabilit/, ar: [["اجمالي", "المطلوبات"], ["مجموع", "المطلوبات"], ["اجمالي", "الخصوم"], ["مجموع", "الخصوم"]] },
  { key: "shortTermDebt", statements: BS, pattern: /^(short.?term (borrowings|debt|loans)|current portion of (long.?term|term) (debt|loans|borrowings)|bank overdrafts?)/, ar: [["قروض", "قصيره"], ["الجزء", "المتداول", "قروض"]] },
  { key: "longTermDebt", statements: BS, pattern: /^(long.?term (borrowings|debt|loans)|term loans?\b|non.?current borrowings)/, ar: [["قروض", "طويله"], ["قروض", "اجل"]] },
  { key: "totalDebt", statements: BS, pattern: /^total (debt|borrowings)/, ar: [["اجمالي", "القروض"], ["اجمالي", "الديون"]] },
  { key: "totalEquity", statements: BS, pattern: /^total (shareholders['’]? )?equity/, ar: [["اجمالي", "حقوق", "الملكيه"], ["مجموع", "حقوق", "الملكيه"], ["اجمالي", "حقوق", "المساهمين"], ["مجموع", "حقوق", "المساهمين"]] },
  { key: "annualDebtService", statements: BS, pattern: /^annual debt service/ },

  // ---- Statement of Cash Flows
  { key: "operatingCashFlow", statements: CF, pattern: /^net cash (flows? )?(generated |used )?(from|in) operating activities/, ar: [["صافي", "النقد", "التشغيليه"], ["النقد", "الانشطه", "التشغيليه"]] },
  { key: "investingCashFlow", statements: CF, pattern: /^net cash (flows? )?(generated |used )?(from|in) investing activities/, ar: [["صافي", "النقد", "الاستثماريه"], ["النقد", "الانشطه", "الاستثماريه"]] },
  { key: "financingCashFlow", statements: CF, pattern: /^net cash (flows? )?(generated |used )?(from|in) financing activities/, ar: [["صافي", "النقد", "التمويليه"], ["النقد", "الانشطه", "التمويليه"]] },
  { key: "capex", statements: CF, pattern: /^(purchases? of property,? plant and equipment|additions? to property,? plant|acquisition of property,? plant|capital expenditures?)/, ar: [["شراء", "ممتلكات"], ["اضافات", "ممتلكات"]] },
];

const KEY_HOME: Record<CanonicalKey, StatementType[]> = Object.fromEntries(
  CANONICAL_KEYS.map((key) => [key, RULES.filter((r) => r.key === key).flatMap((r) => r.statements)]),
) as Record<CanonicalKey, StatementType[]>;

export function normalizeLabel(statement: StatementType, label: string): CanonicalKey | null {
  const en = label.toLowerCase().trim();
  const ar = normalizeArabic(label);
  for (const rule of RULES) {
    if (!rule.statements.includes(statement)) continue;
    if (rule.pattern.test(en)) return rule.key;
    if (rule.ar && matchesArabicGroups(ar, rule.ar)) return rule.key;
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
 * Per (key, year): the key's home statement wins, first occurrence within it.
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
      break;
    }
  }
  return byYear;
}
