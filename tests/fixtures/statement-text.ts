/**
 * Renders a CompanyProfile as realistic IFRS statement text pages — the
 * exact layout auditors print: heading, "Note  YYYY  YYYY" columns, dot-free
 * labels, parenthesised negatives. Shared by parser unit tests and the
 * sample-PDF generator.
 */
import type { CompanyProfile, YearFigures } from "./company-profiles";
import type { PageText } from "@/lib/ifrs/types";

function amount(value: number): string {
  const formatted = Math.abs(value).toLocaleString("en-US");
  return value < 0 ? `(${formatted})` : formatted;
}

function row(label: string, note: string, values: number[]): string {
  const cells = values.map((v) => amount(v).padStart(13)).join("  ");
  return `${label.padEnd(42)}${note.padStart(4)}  ${cells}`;
}

function totalRow(label: string, values: number[]): string {
  const cells = values.map((v) => amount(v).padStart(13)).join("  ");
  return `${label.padEnd(46)}  ${cells}`;
}

function header(company: string, statement: string, years: number[]): string[] {
  return [
    company,
    statement,
    `For the year ended 31 December ${years[0]}`,
    "(All amounts in Saudi Riyals)",
    "",
    `${" ".repeat(42)}Note  ${years.map((y) => String(y).padStart(13)).join("  ")}`,
  ];
}

function pick<K extends keyof YearFigures>(years: YearFigures[], key: K): number[] {
  return years.map((y) => y[key] as number);
}

export function financialPositionPage(profile: CompanyProfile): string {
  const ys = profile.years;
  const yearNums = ys.map((y) => y.fiscalYear);
  return [
    ...header(profile.name, "Statement of Financial Position", yearNums),
    "ASSETS",
    row("Cash and cash equivalents", "4", pick(ys, "cash")),
    row("Trade receivables", "5", pick(ys, "receivables")),
    row("Inventories", "6", pick(ys, "inventory")),
    totalRow("Total current assets", pick(ys, "currentAssets")),
    row("Property, plant and equipment", "7", pick(ys, "ppe")),
    totalRow("Total assets", pick(ys, "totalAssets")),
    "LIABILITIES",
    row("Short-term borrowings", "8", pick(ys, "shortTermDebt")),
    row("Trade payables", "9", pick(ys, "tradePayables")),
    totalRow("Total current liabilities", pick(ys, "currentLiabilities")),
    row("Long-term borrowings", "10", pick(ys, "longTermDebt")),
    totalRow("Total liabilities", pick(ys, "totalLiabilities")),
    "EQUITY",
    row("Share capital", "11", pick(ys, "shareCapital")),
    row("Retained earnings", "", pick(ys, "retainedEarnings")),
    totalRow("Total equity", pick(ys, "totalEquity")),
  ].join("\n");
}

export function profitOrLossPage(profile: CompanyProfile): string {
  const ys = profile.years;
  const yearNums = ys.map((y) => y.fiscalYear);
  return [
    ...header(profile.name, "Statement of Profit or Loss", yearNums),
    row("Revenue", "12", pick(ys, "revenue")),
    row("Cost of revenue", "13", pick(ys, "cogs").map((v) => -v)),
    totalRow("Gross profit", pick(ys, "grossProfit")),
    row("Operating profit", "", pick(ys, "operatingIncome")),
    row("Finance costs", "14", pick(ys, "financeCosts").map((v) => -v)),
    totalRow("Net profit for the year", pick(ys, "netIncome")),
  ].join("\n");
}

export function cashFlowsPage(profile: CompanyProfile): string {
  const ys = profile.years;
  const yearNums = ys.map((y) => y.fiscalYear);
  return [
    ...header(profile.name, "Statement of Cash Flows", yearNums),
    // The reconciliation add-back auditors always print — the parser reads it
    // so the engine can derive EBITDA (operating profit + D&A) for coverage.
    row("Depreciation and amortisation", "6", pick(ys, "depreciationAmortization")),
    totalRow("Net cash from operating activities", pick(ys, "operatingCashFlow")),
    row("Purchase of property, plant and equipment", "7", pick(ys, "capex").map((v) => -v)),
    totalRow("Net cash used in investing activities", pick(ys, "investingCashFlow")),
    totalRow("Net cash from financing activities", pick(ys, "financingCashFlow")),
    totalRow("Cash and cash equivalents at year end", pick(ys, "cash")),
  ].join("\n");
}

/** Three statement pages as the parser's PageText input. */
export function profilePages(profile: CompanyProfile): PageText[] {
  return [
    { pageNumber: 1, text: financialPositionPage(profile) },
    { pageNumber: 2, text: profitOrLossPage(profile) },
    { pageNumber: 3, text: cashFlowsPage(profile) },
  ];
}
