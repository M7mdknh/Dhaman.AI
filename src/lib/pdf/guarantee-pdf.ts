/**
 * Letter of Guarantee PDF layout (Sprint 5). Pure data → bytes: the same
 * guarantee row always renders the identical document, so nothing is ever
 * stored on disk — the authenticated route renders on demand.
 *
 * pdf-lib (pure TS, serverless-safe) + qrcode for the verification stamp.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

export interface GuaranteePdfData {
  reference: string;
  caseReference: string;
  companyName: string;
  crNumber: string;
  beneficiary: string;
  guaranteeTypeLabel: string;
  /** Decimal string, e.g. "6000000.00". */
  amount: string;
  currency: string;
  contractTitle: string;
  issueDate: Date;
  expiryDate: Date;
  officerName: string;
}

// A4 in points.
const PAGE = { width: 595.28, height: 841.89 } as const;
const MARGIN = 56;
const INK = rgb(0.09, 0.11, 0.13);
const MUTED = rgb(0.42, 0.45, 0.48);
const RULE = rgb(0.85, 0.87, 0.88);
const ACCENT = rgb(0.02, 0.47, 0.34);

function formatAmount(amount: string, currency: string): string {
  const [whole, fraction = "00"] = amount.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${grouped}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Word-wraps `text` to `maxWidth` using real font metrics. */
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

export async function renderGuaranteePdf(data: GuaranteePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Letter of Guarantee ${data.reference}`);
  doc.setAuthor("Daman — Corporate Underwriting");

  const page = doc.addPage([PAGE.width, PAGE.height]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE.width - MARGIN * 2;
  let y = PAGE.height - MARGIN;

  const drawRule = (at: number) =>
    page.drawLine({
      start: { x: MARGIN, y: at },
      end: { x: PAGE.width - MARGIN, y: at },
      thickness: 0.75,
      color: RULE,
    });

  // ---- Letterhead
  page.drawText("DAMAN", { x: MARGIN, y: y - 14, size: 20, font: bold, color: ACCENT });
  page.drawText("Corporate Underwriting", {
    x: MARGIN,
    y: y - 28,
    size: 9,
    font: regular,
    color: MUTED,
  });
  const refLabel = `Ref. ${data.reference}`;
  page.drawText(refLabel, {
    x: PAGE.width - MARGIN - bold.widthOfTextAtSize(refLabel, 10),
    y: y - 14,
    size: 10,
    font: bold,
    color: INK,
  });
  const issued = `Issued ${formatDate(data.issueDate)}`;
  page.drawText(issued, {
    x: PAGE.width - MARGIN - regular.widthOfTextAtSize(issued, 9),
    y: y - 28,
    size: 9,
    font: regular,
    color: MUTED,
  });
  y -= 44;
  drawRule(y);
  y -= 36;

  // ---- Title
  const title = "LETTER OF GUARANTEE";
  page.drawText(title, {
    x: (PAGE.width - bold.widthOfTextAtSize(title, 16)) / 2,
    y,
    size: 16,
    font: bold,
    color: INK,
  });
  y -= 16;
  const subtitle = data.guaranteeTypeLabel;
  page.drawText(subtitle, {
    x: (PAGE.width - regular.widthOfTextAtSize(subtitle, 10)) / 2,
    y,
    size: 10,
    font: regular,
    color: MUTED,
  });
  y -= 34;

  // ---- Body
  const paragraphs = [
    `To: ${data.beneficiary}`,
    `At the request of ${data.companyName} (Commercial Registration No. ${data.crNumber}), ` +
      `we, Daman — Corporate Underwriting, hereby irrevocably and unconditionally guarantee ` +
      `payment to you of any amount not exceeding ${formatAmount(data.amount, data.currency)} ` +
      `(the "Guarantee Amount") in connection with the contract "${data.contractTitle}" ` +
      `(underwriting case ${data.caseReference}).`,
    `Any demand under this guarantee must be received by us in writing on or before ` +
      `${formatDate(data.expiryDate)}, after which date this guarantee expires automatically ` +
      `and in full, whether or not this document is returned to us.`,
    `This guarantee is personal to the beneficiary and is not assignable or transferable. ` +
      `It is governed by the laws and regulations of the Kingdom of Saudi Arabia.`,
  ];
  for (const paragraph of paragraphs) {
    const lines = wrapText(paragraph, regular, 10.5, contentWidth);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size: 10.5, font: regular, color: INK, lineHeight: 15 });
      y -= 15;
    }
    y -= 9;
  }
  y -= 4;

  // ---- Particulars table
  const rows: [string, string][] = [
    ["Guarantee Reference", data.reference],
    ["Underwriting Case", data.caseReference],
    ["Applicant", `${data.companyName} — CR ${data.crNumber}`],
    ["Beneficiary", data.beneficiary],
    ["Guarantee Type", data.guaranteeTypeLabel],
    ["Guarantee Amount", formatAmount(data.amount, data.currency)],
    ["Issue Date", formatDate(data.issueDate)],
    ["Expiry Date", formatDate(data.expiryDate)],
    ["Authorized Officer", data.officerName],
  ];
  const rowHeight = 22;
  const labelWidth = 170;
  drawRule(y + 6);
  for (const [label, value] of rows) {
    y -= rowHeight;
    page.drawText(label.toUpperCase(), {
      x: MARGIN,
      y: y + 7,
      size: 7.5,
      font: bold,
      color: MUTED,
    });
    page.drawText(value, { x: MARGIN + labelWidth, y: y + 6, size: 10, font: regular, color: INK });
    drawRule(y);
  }
  y -= 30;

  // ---- Verification stamp (QR) + signature block
  const qrPayload = JSON.stringify({
    ref: data.reference,
    case: data.caseReference,
    amount: data.amount,
    currency: data.currency,
    expires: data.expiryDate.toISOString().slice(0, 10),
  });
  const qrPng = await QRCode.toBuffer(qrPayload, { type: "png", width: 220, margin: 1 });
  const qrImage = await doc.embedPng(qrPng);
  const qrSize = 92;
  drawSignatureBlock(page, bold, regular, MARGIN, y, data.officerName);
  page.drawImage(qrImage, {
    x: PAGE.width - MARGIN - qrSize,
    y: y - qrSize + 8,
    width: qrSize,
    height: qrSize,
  });
  page.drawText("Scan to verify particulars", {
    x: PAGE.width - MARGIN - qrSize,
    y: y - qrSize - 4,
    size: 7,
    font: regular,
    color: MUTED,
  });

  // ---- Footer
  const footer =
    "This Letter of Guarantee was generated electronically by the Daman underwriting platform " +
    "and is valid without a handwritten signature.";
  const footerLines = wrapText(footer, regular, 7.5, contentWidth);
  let footerY = MARGIN - 6 + footerLines.length * 10;
  drawRule(footerY + 8);
  for (const line of footerLines) {
    page.drawText(line, { x: MARGIN, y: footerY - 8, size: 7.5, font: regular, color: MUTED });
    footerY -= 10;
  }

  return doc.save();
}

function drawSignatureBlock(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  x: number,
  y: number,
  officerName: string,
) {
  page.drawText("For and on behalf of Daman", {
    x,
    y: y - 12,
    size: 9,
    font: regular,
    color: MUTED,
  });
  page.drawText(officerName, { x, y: y - 46, size: 11, font: bold, color: INK });
  page.drawLine({
    start: { x, y: y - 52 },
    end: { x: x + 180, y: y - 52 },
    thickness: 0.75,
    color: RULE,
  });
  page.drawText("Authorized Risk Officer", {
    x,
    y: y - 63,
    size: 8,
    font: regular,
    color: MUTED,
  });
}
