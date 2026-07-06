/**
 * Minimal single-purpose PDF writer: turns text pages into a real,
 * text-layer PDF (Courier, one Tj per line). Used to fabricate audited
 * statement PDFs for tests and demos — NOT a general PDF library.
 */

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function textPagesToPdf(pages: string[]): Buffer {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  // 1 = catalog, 2 = pages tree, 3 = font; content/page pairs follow.
  let nextId = 4;
  const contents: { id: number; body: string }[] = [];

  for (const pageText of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageObjectIds.push(pageId);

    const lines = pageText.split("\n");
    let stream = "BT\n/F1 8 Tf\n";
    let y = 810;
    for (const line of lines) {
      stream += `1 0 0 1 36 ${y} Tm (${escapePdfText(line)}) Tj\n`;
      y -= 11;
    }
    stream += "ET";

    contents.push({ id: contentId, body: stream });
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
  }

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`;
  for (const { id, body } of contents) {
    objects[id] = `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`;
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < nextId; id++) {
    offsets[id] = Buffer.byteLength(pdf);
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id++) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}
