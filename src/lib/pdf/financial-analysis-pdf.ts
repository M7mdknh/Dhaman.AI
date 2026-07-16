/**
 * Financial Intelligence Report PDF (bank-side export). Pure data → bytes,
 * same conventions as the Letter of Guarantee renderer (lib/pdf/guarantee-pdf.ts):
 * pdf-lib (pure TS, serverless-safe), rendered on demand, nothing stored on
 * disk. Every figure comes straight from the deterministic engine's already-
 * computed FinancialIntelligenceReport — nothing is recalculated here.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import { deriveHeadline } from "@/lib/finance/headline";
import { formatMoney, formatPercent, formatRatio } from "@/lib/format";

import type { FinancialIntelligenceReport, RatioKey } from "@/lib/finance/types";

export interface FinancialAnalysisPdfData {
  caseReference: string;
  companyName: string;
  crNumber: string;
  contractTitle: string;
  guaranteeAmount: string;
  currency: string;
  generatedAt: Date;
  report: FinancialIntelligenceReport;
}

// A4 in points.
const PAGE = { width: 595.28, height: 841.89 } as const;
const MARGIN = 56;
const INK = rgb(0.09, 0.11, 0.13);
const MUTED = rgb(0.42, 0.45, 0.48);
const RULE = rgb(0.85, 0.87, 0.88);
const ACCENT = rgb(0.02, 0.47, 0.34);
const RISK_TONE: Record<string, ReturnType<typeof rgb>> = {
  EXCELLENT: rgb(0.02, 0.47, 0.34),
  LOW: rgb(0.02, 0.47, 0.34),
  MODERATE: rgb(0.7, 0.5, 0.05),
  HIGH: rgb(0.72, 0.15, 0.15),
  CRITICAL: rgb(0.72, 0.15, 0.15),
};

/** A real logo image, if one has been dropped in — falls back to a text
 * wordmark (matching the Letter of Guarantee's letterhead) when absent, so
 * this renders correctly today and picks up a real logo with zero code
 * changes the moment `public/bank-logo.png` (or .jpg) exists. */
async function loadLogo(doc: PDFDocument) {
  for (const [file, embed] of [
    ["bank-logo.png", "embedPng"],
    ["bank-logo.jpg", "embedJpg"],
    ["bank-logo.jpeg", "embedJpg"],
  ] as const) {
    try {
      const bytes = await readFile(path.join(process.cwd(), "public", file));
      return await doc[embed](bytes);
    } catch {
      // Not present — try the next candidate, then fall back to text.
    }
  }
  return null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const RATIO_CATEGORIES: { title: string; rows: { key: RatioKey; label: string; percent?: boolean }[] }[] = [
  {
    title: "Liquidity",
    rows: [
      { key: "currentRatio", label: "Current Ratio" },
      { key: "quickRatio", label: "Quick Ratio" },
      { key: "cashRatio", label: "Cash Ratio" },
    ],
  },
  {
    title: "Leverage",
    rows: [
      { key: "debtRatio", label: "Debt Ratio" },
      { key: "debtToEquity", label: "Debt to Equity" },
      { key: "debtToAssets", label: "Debt to Assets" },
      { key: "interestCoverage", label: "Interest Coverage" },
    ],
  },
  {
    title: "Profitability",
    rows: [
      { key: "grossMargin", label: "Gross Margin", percent: true },
      { key: "operatingMargin", label: "Operating Margin", percent: true },
      { key: "netMargin", label: "Net Profit Margin", percent: true },
      { key: "returnOnAssets", label: "Return on Assets", percent: true },
      { key: "returnOnEquity", label: "Return on Equity", percent: true },
      { key: "ebitdaMargin", label: "EBITDA Margin", percent: true },
    ],
  },
  {
    title: "Efficiency",
    rows: [
      { key: "assetTurnover", label: "Asset Turnover" },
      { key: "inventoryTurnover", label: "Inventory Turnover" },
      { key: "receivableTurnover", label: "Receivable Turnover" },
    ],
  },
  {
    title: "Cash Flow & Coverage",
    rows: [
      { key: "operatingCashFlowRatio", label: "Operating Cash Flow Ratio" },
      { key: "dscr", label: "Debt Service Coverage (DSCR)" },
      { key: "ebitdaCoverage", label: "EBITDA Coverage" },
    ],
  },
];

export async function renderFinancialAnalysisPdf(
  data: FinancialAnalysisPdfData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Financial Intelligence Report — ${data.caseReference}`);
  doc.setAuthor("Daman — Corporate Underwriting");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(doc);
  const contentWidth = PAGE.width - MARGIN * 2;

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const drawRule = (at: number) =>
    page.drawLine({
      start: { x: MARGIN, y: at },
      end: { x: PAGE.width - MARGIN, y: at },
      thickness: 0.75,
      color: RULE,
    });

  /** Starts a fresh page (with a running letterhead) whenever content would
   * run past the bottom margin — this report is long enough to paginate. */
  function ensureSpace(rowsNeeded: number) {
    if (y - rowsNeeded > MARGIN + 40) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
    page.drawText(`Financial Intelligence Report — ${data.caseReference}`, {
      x: MARGIN,
      y,
      size: 9,
      font: bold,
      color: MUTED,
    });
    y -= 20;
    drawRule(y);
    y -= 24;
  }

  // ---- Letterhead
  if (logo) {
    const logoHeight = 32;
    const scale = logoHeight / logo.height;
    page.drawImage(logo, { x: MARGIN, y: y - logoHeight + 4, width: logo.width * scale, height: logoHeight });
  } else {
    page.drawText("DAMAN", { x: MARGIN, y: y - 14, size: 20, font: bold, color: ACCENT });
    page.drawText("Corporate Underwriting — Alinma Bank", {
      x: MARGIN,
      y: y - 28,
      size: 9,
      font: regular,
      color: MUTED,
    });
  }
  const genLabel = `Generated ${formatDate(data.generatedAt)}`;
  page.drawText(genLabel, {
    x: PAGE.width - MARGIN - regular.widthOfTextAtSize(genLabel, 9),
    y: y - 14,
    size: 9,
    font: regular,
    color: MUTED,
  });
  const refLabel = `Case ${data.caseReference}`;
  page.drawText(refLabel, {
    x: PAGE.width - MARGIN - bold.widthOfTextAtSize(refLabel, 10),
    y: y - 28,
    size: 10,
    font: bold,
    color: INK,
  });
  y -= 44;
  drawRule(y);
  y -= 32;

  // ---- Title
  const title = "FINANCIAL INTELLIGENCE REPORT";
  page.drawText(title, {
    x: (PAGE.width - bold.widthOfTextAtSize(title, 15)) / 2,
    y,
    size: 15,
    font: bold,
    color: INK,
  });
  y -= 15;
  const subtitle = "Deterministic analysis — no AI involved in any figure in this report.";
  page.drawText(subtitle, {
    x: (PAGE.width - regular.widthOfTextAtSize(subtitle, 9)) / 2,
    y,
    size: 9,
    font: regular,
    color: MUTED,
  });
  y -= 30;

  // ---- Applicant particulars
  const particulars: [string, string][] = [
    ["Applicant", `${data.companyName} — CR ${data.crNumber}`],
    ["Contract", data.contractTitle],
    ["Requested Guarantee", formatMoney(data.guaranteeAmount, data.currency)],
    ["Fiscal Years Covered", data.report.years.join(", ")],
  ];
  for (const [label, value] of particulars) {
    page.drawText(label.toUpperCase(), { x: MARGIN, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(value, { x: MARGIN + 150, y, size: 10, font: regular, color: INK });
    y -= 18;
  }
  y -= 8;

  // ---- Verdict
  const headline = deriveHeadline(data.report);
  const riskColor = RISK_TONE[headline.riskBand] ?? INK;
  drawRule(y + 8);
  y -= 14;
  page.drawText("UNDERWRITING VERDICT", { x: MARGIN, y, size: 8.5, font: bold, color: MUTED });
  y -= 20;
  const verdictCols: [string, string, ReturnType<typeof rgb>][] = [
    ["Capacity", headline.capacityScore !== null ? `${headline.capacityScore}/100 (${headline.capacityBand})` : "—", INK],
    ["Financial Health", `${headline.healthScore}/100`, INK],
    ["Risk Score", `${headline.riskScore}/100 (${headline.riskBand})`, riskColor],
    ["Rating", headline.rating, INK],
  ];
  const colWidth = contentWidth / verdictCols.length;
  verdictCols.forEach(([label, value, color], i) => {
    const x = MARGIN + i * colWidth;
    page.drawText(label.toUpperCase(), { x, y, size: 7, font: bold, color: MUTED });
    page.drawText(value, { x, y: y - 16, size: 12, font: bold, color });
  });
  y -= 40;
  if (data.report.disclosures.orderOfLiquidity) {
    const note = wrapText(
      "This balance sheet is presented in order of liquidity, without a current/non-current " +
        "split — liquidity ratios and working capital are not disclosed by the statement.",
      regular,
      8,
      contentWidth,
    );
    for (const line of note) {
      page.drawText(line, { x: MARGIN, y, size: 8, font: regular, color: MUTED });
      y -= 11;
    }
  }
  y -= 10;

  // ---- Ratio tables
  for (const category of RATIO_CATEGORIES) {
    ensureSpace(40 + category.rows.length * 16);
    drawRule(y + 10);
    y -= 6;
    page.drawText(category.title.toUpperCase(), { x: MARGIN, y, size: 9, font: bold, color: INK });
    y -= 6;
    const years = data.report.years;
    const labelWidth = 220;
    const yearColWidth = Math.min(70, (contentWidth - labelWidth) / Math.max(years.length, 1));
    y -= 14;
    years.forEach((year, i) => {
      const x = MARGIN + labelWidth + i * yearColWidth;
      const text = `FY${year}`;
      page.drawText(text, {
        x: x + yearColWidth - regular.widthOfTextAtSize(text, 8),
        y,
        size: 8,
        font: bold,
        color: MUTED,
      });
    });
    y -= 14;
    for (const row of category.rows) {
      page.drawText(row.label, { x: MARGIN, y, size: 9, font: regular, color: INK });
      years.forEach((year, i) => {
        const yearRatios = data.report.ratiosByYear.find((r) => r.fiscalYear === year);
        const value = yearRatios?.ratios[row.key] ?? null;
        const text = row.percent ? formatPercent(value) : formatRatio(value);
        const x = MARGIN + labelWidth + i * yearColWidth;
        page.drawText(text, {
          x: x + yearColWidth - regular.widthOfTextAtSize(text, 9),
          y,
          size: 9,
          font: regular,
          color: INK,
        });
      });
      y -= 14;
    }
    y -= 8;
  }

  // ---- Risk flags
  if (data.report.flags.length > 0) {
    ensureSpace(40 + data.report.flags.length * 24);
    drawRule(y + 10);
    y -= 6;
    page.drawText("RISK FLAGS", { x: MARGIN, y, size: 9, font: bold, color: INK });
    y -= 16;
    for (const flag of data.report.flags) {
      ensureSpace(30);
      const sevColor =
        flag.severity === "HIGH" ? RISK_TONE.HIGH : flag.severity === "MEDIUM" ? RISK_TONE.MODERATE : MUTED;
      page.drawText(`[${flag.severity}]`, { x: MARGIN, y, size: 8, font: bold, color: sevColor });
      const lines = wrapText(flag.explanation, regular, 9, contentWidth - 50);
      lines.forEach((line, i) => {
        page.drawText(line, { x: MARGIN + 46, y: y - i * 12, size: 9, font: regular, color: INK });
      });
      y -= Math.max(12, lines.length * 12) + 8;
    }
  }

  // ---- Footer (every page)
  const footer =
    "This report is generated by the Daman deterministic Financial Intelligence Engine. Every " +
    "ratio and score is computed directly from the parsed IFRS statements — no figure on this " +
    "page is produced or altered by AI.";
  for (const p of doc.getPages()) {
    const footerLines = wrapText(footer, regular, 7, contentWidth);
    let footerY = MARGIN - 6 + footerLines.length * 9;
    p.drawLine({
      start: { x: MARGIN, y: footerY + 8 },
      end: { x: PAGE.width - MARGIN, y: footerY + 8 },
      thickness: 0.75,
      color: RULE,
    });
    for (const line of footerLines) {
      p.drawText(line, { x: MARGIN, y: footerY - 7, size: 7, font: regular, color: MUTED });
      footerY -= 9;
    }
  }

  return doc.save();
}
