/**
 * Bilingual (English + Arabic) vocabulary for IFRS statement detection and
 * label normalization. Saudi listed companies file audited statements in
 * Arabic, English, or both; detection must never assume English wording.
 *
 * Matching is keyword/substring based (not exact headings) so it tolerates
 * "consolidated", "(continued)", OCR noise and formatting differences across
 * auditors (EY, PwC, Deloitte, KPMG) and issuers.
 */
import type { StatementType } from "@/lib/ifrs/types";

/** Convert Arabic-Indic (٠-٩) and Eastern-Arabic (۰-۹) digits to ASCII. */
export function toWesternDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Strip Arabic diacritics/tatweel so labels compare stably. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْٰ]/g, "") // harakat
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/**
 * Statement heading detectors. Each type carries English regexes and Arabic
 * keyword sets (order matters for P&L: comprehensive-income before income).
 */
export const STATEMENT_HEADINGS: {
  type: StatementType;
  en: RegExp;
  /** Arabic keyword groups; all tokens in a group must appear on the page-head. */
  ar: string[][];
}[] = [
  {
    type: "FINANCIAL_POSITION",
    en: /statement\s+of\s+financial\s+position|balance\s+sheet/i,
    ar: [["المركز", "المالي"]], // قائمة المركز المالي
  },
  {
    type: "PROFIT_OR_LOSS",
    en: /statement\s+of\s+(profit\s+or\s+loss|comprehensive\s+income|income)|income\s+statement/i,
    ar: [
      ["الخساره"], // ...الربح أو الخسارة — "loss" is distinctive to the P&L heading
      ["الدخل", "الشامل"], // الدخل الشامل (comprehensive income)
      ["الربح", "الخساره"], // الربح أو الخسارة
    ],
  },
  {
    type: "CASH_FLOWS",
    en: /statement\s+of\s+cash\s*flows?|cash\s*flows?\s+statement/i,
    ar: [["التدفقات", "النقديه"], ["التدفقات"]], // التدفقات النقدية — "flows" is distinctive
  },
  {
    type: "CHANGES_IN_EQUITY",
    en: /statement\s+of\s+changes\s+in\s+(shareholders['’]?\s+)?equity/i,
    ar: [
      ["التغيرات", "حقوق"], // التغيرات في حقوق الملكية/المساهمين
    ],
  },
];

/** Pages that merely reference statements (notes, auditor report, TOC). */
export const EXCLUDED_HEADINGS = {
  en: /notes\s+to\s+the\s+(consolidated\s+)?financial\s+statements|independent\s+auditor|auditor['’]s\s+report|table\s+of\s+contents|^\s*contents\s*$/im,
  ar: [
    ["ايضاحات"], // إيضاحات (notes)
    ["تقرير", "الحسابات"], // تقرير مراجع الحسابات (auditor report)
    ["تقرير", "المراجع"],
    ["المحتويات"], // contents
  ],
};

/** Scale keywords (Arabic + English). */
export const SCALE_TERMS: { multiplier: number; en: RegExp; ar: string[] }[] = [
  { multiplier: 1_000_000, en: /in\s+millions|(sar|sr|usd)\s*(million|mn)\b/i, ar: ["ملايين", "بالملايين"] },
  { multiplier: 1_000, en: /['’`]\s?000|in\s+thousands|thousands\s+of/i, ar: ["الاف", "بالاف"] }, // آلاف → الاف after normalize
];

/** Currency keywords (Arabic + English). */
export const CURRENCY_TERMS: { code: string; en: RegExp; ar: string[] }[] = [
  { code: "SAR", en: /saudi\s+riyals?|\bSAR\b|\bSR\b/i, ar: ["ريال", "الريالات", "ريالات"] },
  { code: "USD", en: /us\s+dollars?|\bUSD\b/i, ar: ["دولار"] },
  { code: "EUR", en: /euros?\b|\bEUR\b/i, ar: ["يورو"] },
];

/** True when every token of any group is present in the normalized text. */
export function matchesArabicGroups(normalizedText: string, groups: string[][]): boolean {
  return groups.some((group) => group.every((tok) => normalizedText.includes(normalizeArabic(tok))));
}
