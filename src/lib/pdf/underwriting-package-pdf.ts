/**
 * Underwriting Package PDF — the complete case file a Relationship Manager
 * hands to senior management: company + contract particulars, the
 * deterministic Financial Intelligence (ratios, health, capacity, risk,
 * rating, flags, trends, validation), the AI-drafted memo, the RM assessment,
 * and the Risk Officer decision.
 *
 * Same conventions as the other renderers (pdf-lib, pure data → bytes,
 * rendered on demand, nothing stored). One template serves every workflow
 * stage: sections that have not happened yet print explicit placeholders
 * ("Pending", "Not completed") — a bank file never leaves blank space that
 * could be mistaken for a missing page.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { deriveHeadline } from "@/lib/finance/headline";
import { formatMoney, formatPercent, formatRatio } from "@/lib/format";
import { RATIO_CATEGORIES } from "@/lib/pdf/financial-analysis-pdf";

import type { FinancialIntelligenceReport } from "@/lib/finance/types";

export interface PackageCompany {
  name: string;
  crNumber: string;
  sector: string;
  city: string;
  contactPerson: string;
}

export interface PackageContract {
  title: string;
  beneficiary: string;
  beneficiaryType: string;
  guaranteeType: string;
  guaranteeAmount: string;
  guaranteePercentage: string;
  contractValue: string;
  currency: string;
  projectLocation: string;
  projectStartDate: Date;
  projectEndDate: Date;
}

export interface PackageMemo {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  riskExplanation: string;
  recommendationLabel: string;
  recommendationReason: string;
  confidenceExplanation: string;
  nextSteps: string[];
  aiDiverged: boolean;
  aiRecommendationLabel: string;
  provider: string;
  model: string;
  promptVersion: string;
  createdAt: Date;
}

export interface PackageRmAssessment {
  /** Latest version-tracked RM refinement (null = memo never refined). */
  revision: {
    version: number;
    summary: string;
    relationshipContext: string | null;
    author: string;
    createdAt: Date;
  } | null;
  suggested: {
    decisionLabel: string;
    reason: string;
    conditions: string | null;
    rm: string;
    createdAt: Date;
  } | null;
  routedBy: string | null;
  routedAt: Date | null;
}

export interface PackageDecision {
  decisionLabel: string;
  officer: string;
  date: Date;
  reason: string;
  conditions: string | null;
}

export interface UnderwritingPackagePdfData {
  caseReference: string;
  statusLabel: string;
  generatedAt: Date;
  submittedAt: Date | null;
  company: PackageCompany;
  contract: PackageContract | null;
  /** Null = the deterministic engines produced no validated assessment yet. */
  report: FinancialIntelligenceReport | null;
  validation: { confidenceLabel: string; summary: string };
  memo: PackageMemo | null;
  rm: PackageRmAssessment;
  /** Null = no terminal decision yet → the section prints Pending placeholders. */
  decision: PackageDecision | null;
  guarantee: { reference: string; issueDate: Date; expiryDate: Date } | null;
}

// A4 in points.
const PAGE = { width: 595.28, height: 841.89 } as const;
const MARGIN = 56;
const FOOTER_SPACE = 64;
const INK = rgb(0.09, 0.11, 0.13);
const MUTED = rgb(0.42, 0.45, 0.48);
const RULE = rgb(0.85, 0.87, 0.88);
const ACCENT = rgb(0.02, 0.47, 0.34);
const AMBER = rgb(0.7, 0.5, 0.05);
const RED = rgb(0.72, 0.15, 0.15);
const RISK_TONE: Record<string, ReturnType<typeof rgb>> = {
  EXCELLENT: ACCENT,
  LOW: ACCENT,
  MODERATE: AMBER,
  HIGH: RED,
  CRITICAL: RED,
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * pdf-lib's standard fonts encode WinAnsi only; AI/RM prose can carry
 * arbitrary Unicode. Map the common typographic characters and drop the rest
 * rather than throwing mid-render.
 */
function sanitize(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[^\x20-\x7E¡-ÿ\n]/g, "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitize(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
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
  }
  return lines;
}

export async function renderUnderwritingPackagePdf(
  data: UnderwritingPackagePdfData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Underwriting Package — ${data.caseReference}`);
  doc.setAuthor("Dhaman — Corporate Underwriting");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const contentWidth = PAGE.width - MARGIN * 2;

  // Logo: real image when present, text wordmark otherwise (same fallback as
  // the other letterheads).
  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  for (const [file, embed] of [
    ["bank-logo.png", "embedPng"],
    ["bank-logo.jpg", "embedJpg"],
    ["bank-logo.jpeg", "embedJpg"],
  ] as const) {
    try {
      logo = await doc[embed](await readFile(path.join(process.cwd(), "public", file)));
      break;
    } catch {
      // Not present — try the next candidate, then fall back to text.
    }
  }

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const rule = (at: number, color = RULE, thickness = 0.75) =>
    page.drawLine({
      start: { x: MARGIN, y: at },
      end: { x: PAGE.width - MARGIN, y: at },
      thickness,
      color,
    });

  /** Fresh page with a compact running header when the next block won't fit. */
  function ensureSpace(needed: number) {
    if (y - needed > MARGIN + FOOTER_SPACE) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
    page.drawText("UNDERWRITING PACKAGE", { x: MARGIN, y, size: 8, font: bold, color: MUTED });
    const ref = sanitize(`${data.company.name} — ${data.caseReference}`);
    page.drawText(ref, {
      x: PAGE.width - MARGIN - regular.widthOfTextAtSize(ref, 8),
      y,
      size: 8,
      font: regular,
      color: MUTED,
    });
    y -= 14;
    rule(y);
    y -= 24;
  }

  /** Numbered section heading with a divider — the document's visual spine. */
  let sectionNo = 0;
  function section(title: string) {
    sectionNo += 1;
    ensureSpace(56);
    y -= 10;
    rule(y + 6, RULE, 0.75);
    y -= 16;
    page.drawText(`${sectionNo}.`, { x: MARGIN, y, size: 10, font: bold, color: MUTED });
    page.drawText(title.toUpperCase(), {
      x: MARGIN + 18,
      y,
      size: 10,
      font: bold,
      color: INK,
    });
    y -= 20;
  }

  function paragraph(text: string, opts?: { size?: number; color?: ReturnType<typeof rgb>; font?: PDFFont; indent?: number }) {
    const size = opts?.size ?? 9.5;
    const font = opts?.font ?? regular;
    const indent = opts?.indent ?? 0;
    const lines = wrapText(text, font, size, contentWidth - indent);
    for (const line of lines) {
      ensureSpace(size + 6);
      page.drawText(line, { x: MARGIN + indent, y, size, font, color: opts?.color ?? INK });
      y -= size + 4;
    }
  }

  function bullets(items: string[]) {
    for (const item of items) {
      const lines = wrapText(item, regular, 9.5, contentWidth - 14);
      ensureSpace(lines.length * 13.5 + 2);
      page.drawText("•", { x: MARGIN + 2, y, size: 9.5, font: regular, color: MUTED });
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + 14, y, size: 9.5, font: regular, color: INK });
        y -= 13.5;
      }
      y -= 1;
    }
  }

  /** Two-column key/value grid — the particulars style of a bank file. */
  function facts(rows: [string, string][], columns = 2) {
    const colWidth = contentWidth / columns;
    const valueWidth = colWidth - 16;
    for (let i = 0; i < rows.length; i += columns) {
      const slice = rows.slice(i, i + columns);
      const heights = slice.map(
        ([, value]) => wrapText(value, regular, 9.5, valueWidth).length * 12 + 12,
      );
      const rowHeight = Math.max(...heights);
      ensureSpace(rowHeight + 4);
      slice.forEach(([label, value], col) => {
        const x = MARGIN + col * colWidth;
        page.drawText(sanitize(label.toUpperCase()), { x, y, size: 6.5, font: bold, color: MUTED });
        let vy = y - 11;
        for (const line of wrapText(value, regular, 9.5, valueWidth)) {
          page.drawText(line, { x, y: vy, size: 9.5, font: regular, color: INK });
          vy -= 12;
        }
      });
      y -= rowHeight + 4;
    }
  }

  function placeholder(text: string) {
    paragraph(text, { font: italic, color: MUTED });
  }

  function subheading(label: string) {
    ensureSpace(22);
    page.drawText(sanitize(label.toUpperCase()), { x: MARGIN, y, size: 6.5, font: bold, color: MUTED });
    y -= 11;
  }

  function labelled(label: string, value: string) {
    subheading(label);
    paragraph(value);
    y -= 4;
  }

  // ================================================================ Letterhead
  if (logo) {
    const logoHeight = 32;
    const scale = logoHeight / logo.height;
    page.drawImage(logo, {
      x: MARGIN,
      y: y - logoHeight + 4,
      width: logo.width * scale,
      height: logoHeight,
    });
  } else {
    page.drawText("DHAMAN", { x: MARGIN, y: y - 14, size: 20, font: bold, color: ACCENT });
    page.drawText("Corporate Underwriting — Alinma Bank", {
      x: MARGIN,
      y: y - 28,
      size: 9,
      font: regular,
      color: MUTED,
    });
  }
  const confidential = "CONFIDENTIAL — INTERNAL USE ONLY";
  page.drawText(confidential, {
    x: PAGE.width - MARGIN - bold.widthOfTextAtSize(confidential, 8),
    y: y - 12,
    size: 8,
    font: bold,
    color: RED,
  });
  const genLabel = `Generated ${formatDate(data.generatedAt)}`;
  page.drawText(genLabel, {
    x: PAGE.width - MARGIN - regular.widthOfTextAtSize(genLabel, 9),
    y: y - 26,
    size: 9,
    font: regular,
    color: MUTED,
  });
  y -= 44;
  rule(y);
  y -= 30;

  // ================================================================ Title block
  const title = "UNDERWRITING PACKAGE";
  page.drawText(title, {
    x: (PAGE.width - bold.widthOfTextAtSize(title, 16)) / 2,
    y,
    size: 16,
    font: bold,
    color: INK,
  });
  y -= 16;
  const subtitle = sanitize(
    `${data.company.name}${data.contract ? ` — ${data.contract.title}` : ""}`,
  );
  page.drawText(subtitle, {
    x: (PAGE.width - regular.widthOfTextAtSize(subtitle, 10)) / 2,
    y,
    size: 10,
    font: regular,
    color: MUTED,
  });
  y -= 14;
  const refLine = `Case ${data.caseReference} · Status: ${data.statusLabel}`;
  page.drawText(refLine, {
    x: (PAGE.width - bold.widthOfTextAtSize(refLine, 9)) / 2,
    y,
    size: 9,
    font: bold,
    color: INK,
  });
  y -= 26;

  // ================================================================ 1. Company
  section("Company Information");
  facts([
    ["Company", data.company.name],
    ["Commercial Registration", data.company.crNumber],
    ["Sector", data.company.sector],
    ["City", data.company.city],
    ["Contact Person", data.company.contactPerson],
    ["Submitted", data.submittedAt ? formatDate(data.submittedAt) : "Not submitted"],
  ]);

  // ================================================================ 2. Contract
  section("Contract Details");
  if (data.contract) {
    const c = data.contract;
    facts([
      ["Contract Title", c.title],
      ["Beneficiary", `${c.beneficiary} (${c.beneficiaryType})`],
      ["Guarantee Type", c.guaranteeType],
      ["Guarantee Amount", formatMoney(c.guaranteeAmount, c.currency)],
      ["Contract Value", formatMoney(c.contractValue, c.currency)],
      ["Guarantee Percentage", `${c.guaranteePercentage}%`],
      ["Project Location", c.projectLocation],
      [
        "Project Period",
        `${formatDate(c.projectStartDate)} — ${formatDate(c.projectEndDate)}`,
      ],
    ]);
  } else {
    placeholder("Contract details have not been completed for this case.");
  }

  // ================================================================ 3. Financial Intelligence
  section("Financial Intelligence");
  if (data.report) {
    const report = data.report;
    const headline = deriveHeadline(report);
    const riskColor = RISK_TONE[headline.riskBand] ?? INK;
    ensureSpace(60);
    const verdictCols: [string, string, ReturnType<typeof rgb>][] = [
      [
        "Underwriting Capacity",
        headline.capacityScore !== null
          ? `${headline.capacityScore}/100 (${headline.capacityBand})`
          : "—",
        INK,
      ],
      ["Financial Health", `${headline.healthScore}/100`, INK],
      ["Risk Score", `${headline.riskScore}/100 (${headline.riskBand})`, riskColor],
      ["Company Rating", headline.rating, INK],
    ];
    const colWidth = contentWidth / verdictCols.length;
    verdictCols.forEach(([label, value, color], i) => {
      const x = MARGIN + i * colWidth;
      page.drawText(label.toUpperCase(), { x, y, size: 6.5, font: bold, color: MUTED });
      page.drawText(value, { x, y: y - 15, size: 11.5, font: bold, color });
    });
    y -= 38;
    const pillarRows: [string, string][] = [
      ["Overall Grade", `${Math.round(report.overall.score)}/100 · ${report.overall.band}`],
      [
        "Qualitative (KYC)",
        report.qualitative
          ? `${Math.round(report.qualitative.score)}/100 · ${report.qualitative.band}`
          : "Not assessed",
      ],
      [
        "Contract Risk",
        report.contractRisk
          ? `${Math.round(report.contractRisk.score)}/100 · ${report.contractRisk.band}`
          : "Not assessed",
      ],
      ["Fiscal Years Covered", report.years.map((yr) => `FY${yr}`).join(", ")],
    ];
    facts(pillarRows);

    // ---- Financial ratios (per category, per year)
    section("Financial Ratios");
    const years = report.years;
    const labelWidth = 210;
    const yearColWidth = Math.min(70, (contentWidth - labelWidth) / Math.max(years.length, 1));
    for (const category of RATIO_CATEGORIES) {
      ensureSpace(34 + category.rows.length * 14);
      page.drawText(category.title.toUpperCase(), {
        x: MARGIN,
        y,
        size: 8,
        font: bold,
        color: MUTED,
      });
      years.forEach((year, i) => {
        const x = MARGIN + labelWidth + i * yearColWidth;
        const text = `FY${year}`;
        page.drawText(text, {
          x: x + yearColWidth - bold.widthOfTextAtSize(text, 8),
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
          const yearRatios = report.ratiosByYear.find((r) => r.fiscalYear === year);
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

    // ---- Trend analysis
    section("Trend Analysis");
    const trendLines = report.trends
      .filter((t) => t.direction !== null)
      .map((t) => {
        const change = t.yoyChanges.at(-1)?.changePct ?? null;
        const changeText =
          change === null
            ? ""
            : t.unit === "money"
              ? ` (${change >= 0 ? "+" : "-"}${Math.abs(change * 100).toFixed(1)}% YoY)`
              : ` (${change >= 0 ? "+" : "-"}${Math.abs(change * 100).toFixed(1)}pp YoY)`;
        return `${t.label}: ${t.direction!.toLowerCase()}${changeText}`;
      });
    if (trendLines.length > 0) {
      bullets(trendLines);
    } else {
      placeholder("Year-over-year trends require at least two verified fiscal years.");
    }

    // ---- Risk flags
    section("Risk Flags");
    if (report.flags.length > 0) {
      for (const flag of report.flags) {
        const lines = wrapText(flag.explanation, regular, 9, contentWidth - 58);
        ensureSpace(lines.length * 12 + 10);
        const sevColor =
          flag.severity === "HIGH" ? RED : flag.severity === "MEDIUM" ? AMBER : MUTED;
        page.drawText(`[${flag.severity}]`, { x: MARGIN, y, size: 8, font: bold, color: sevColor });
        lines.forEach((line, i) => {
          page.drawText(line, { x: MARGIN + 52, y: y - i * 12, size: 9, font: regular, color: INK });
        });
        y -= Math.max(12, lines.length * 12) + 6;
      }
    } else {
      placeholder("No risk flags were raised by the deterministic analysis.");
    }
  } else {
    placeholder(
      "No validated financial analysis exists for this case yet. The Financial Intelligence, " +
        "ratio, trend, and risk-flag sections populate once the audited statements are verified.",
    );
  }

  // ================================================================ Validation
  section("Validation Summary");
  facts([["Assessment Confidence", data.validation.confidenceLabel]], 1);
  paragraph(data.validation.summary, { color: MUTED, size: 9 });

  // ================================================================ AI sections
  section("AI Executive Summary");
  if (data.memo) {
    paragraph(data.memo.summary);
    if (data.memo.strengths.length > 0) {
      y -= 6;
      subheading("Key Strengths");
      bullets(data.memo.strengths);
    }
    if (data.memo.weaknesses.length > 0) {
      y -= 6;
      subheading("Key Weaknesses");
      bullets(data.memo.weaknesses);
    }
    y -= 4;
    paragraph(
      `AI-drafted (${data.memo.provider} · ${data.memo.model} · prompt ${data.memo.promptVersion}, ` +
        `${formatDate(data.memo.createdAt)}). The AI explains the deterministic figures — it never calculates and never decides.`,
      { size: 7.5, color: MUTED },
    );
  } else {
    placeholder("Not completed — the AI memorandum has not been generated yet.");
  }

  section("AI Recommendation");
  if (data.memo) {
    facts([["Recommendation", data.memo.recommendationLabel]], 1);
    paragraph(data.memo.recommendationReason);
    y -= 4;
    labelled("Confidence", data.memo.confidenceExplanation);
    if (data.memo.aiDiverged) {
      paragraph(
        `Note: the model suggested "${data.memo.aiRecommendationLabel}" — bank policy (derived ` +
          "deterministically from the risk band) prevails; the divergence is recorded for review.",
        { size: 8.5, color: AMBER },
      );
    }
    if (data.memo.nextSteps.length > 0) {
      y -= 4;
      subheading("Recommended Next Steps");
      bullets(data.memo.nextSteps);
    }
  } else {
    placeholder("Not completed — pending AI memorandum generation.");
  }

  // ================================================================ RM Assessment
  section("Relationship Manager Assessment");
  if (data.rm.revision || data.rm.routedAt || data.rm.suggested) {
    if (data.rm.revision) {
      facts([
        ["Refined By", data.rm.revision.author],
        ["Revision", `Version ${data.rm.revision.version} · ${formatDate(data.rm.revision.createdAt)}`],
      ]);
      labelled("RM Executive Summary", data.rm.revision.summary);
      if (data.rm.revision.relationshipContext) {
        labelled("Relationship Context", data.rm.revision.relationshipContext);
      }
    } else {
      placeholder("The AI memorandum was routed without refinement.");
    }
    if (data.rm.suggested) {
      facts([
        ["Suggested Decision", data.rm.suggested.decisionLabel],
        ["Suggested By", `${data.rm.suggested.rm} · ${formatDate(data.rm.suggested.createdAt)}`],
      ]);
      labelled("Rationale", data.rm.suggested.reason);
      if (data.rm.suggested.conditions) {
        labelled("Suggested Conditions", data.rm.suggested.conditions);
      }
      paragraph(
        "The RM suggestion is a recommendation only — the final decision rests with the Risk Officer.",
        { size: 7.5, color: MUTED },
      );
    }
    if (data.rm.routedAt) {
      paragraph(
        `Routed to the Risk Officer by ${data.rm.routedBy ?? "the Relationship Manager"} on ${formatDate(data.rm.routedAt)}.`,
        { size: 8.5, color: MUTED },
      );
    }
  } else {
    placeholder("Not completed — the Relationship Manager has not reviewed this case yet.");
  }

  // ================================================================ Decision
  section("Risk Officer Decision");
  if (data.decision) {
    facts([
      ["Final Decision", data.decision.decisionLabel],
      ["Risk Officer", data.decision.officer],
      ["Decision Date", formatDate(data.decision.date)],
      ...(data.guarantee
        ? ([["Letter of Guarantee", `${data.guarantee.reference} · issued ${formatDate(data.guarantee.issueDate)} · expires ${formatDate(data.guarantee.expiryDate)}`]] as [string, string][])
        : []),
    ]);
    labelled("Decision Reason", data.decision.reason);
    if (data.decision.conditions) {
      labelled("Conditions / Required Margin & Collateral", data.decision.conditions);
    }
  } else {
    facts([
      ["Final Decision", "Pending"],
      ["Risk Officer", "Pending"],
      ["Decision Date", "Pending"],
      ["Decision Reason", "Pending"],
    ]);
    paragraph(
      "This package precedes the Risk Officer's decision. The section above is completed when " +
        "the decision is recorded.",
      { size: 8.5, color: MUTED, font: italic },
    );
  }

  // ================================================================ Signature block
  ensureSpace(70);
  y -= 14;
  rule(y + 6);
  y -= 20;
  const sigColWidth = contentWidth / 2;
  (
    [
      ["Relationship Manager", data.rm.routedBy ?? ""],
      ["Risk Officer", data.decision?.officer ?? ""],
    ] as const
  ).forEach(([role, name], i) => {
    const x = MARGIN + i * sigColWidth;
    page.drawLine({
      start: { x, y: y - 18 },
      end: { x: x + sigColWidth - 40, y: y - 18 },
      thickness: 0.75,
      color: RULE,
    });
    if (name) {
      page.drawText(sanitize(name), { x, y: y - 14, size: 9.5, font: regular, color: INK });
    }
    page.drawText(role.toUpperCase(), { x, y: y - 30, size: 6.5, font: bold, color: MUTED });
  });
  y -= 44;

  // ================================================================ Footer (every page)
  const pages = doc.getPages();
  const footerText =
    "Prepared by the Dhaman Corporate Underwriting Platform. All ratios and scores are computed " +
    "deterministically from the audited IFRS statements; AI-drafted sections are labelled and " +
    "never alter a figure. Confidential — internal use only.";
  pages.forEach((p, index) => {
    const footerLines = wrapText(footerText, regular, 7, contentWidth - 90);
    let footerY = MARGIN - 8 + footerLines.length * 9;
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
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    p.drawText(pageLabel, {
      x: PAGE.width - MARGIN - regular.widthOfTextAtSize(pageLabel, 8),
      y: MARGIN - 8 + wrapText(footerText, regular, 7, contentWidth - 90).length * 9 - 7,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return doc.save();
}
