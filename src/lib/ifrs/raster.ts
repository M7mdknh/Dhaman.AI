/**
 * Rasterizes PDF pages to PNG via MuPDF, for the OCR path used on documents
 * whose text layer is broken or absent (scanned / "compressed" Arabic PDFs).
 * Pure: PDF bytes in, PNG bytes out. No Prisma, no framework.
 */
import type * as MupdfModule from "mupdf";

// Same lazy WASM import strategy as pdf-text (top-level await in the module).
let mupdfModule: Promise<typeof MupdfModule> | null = null;
function loadMupdf(): Promise<typeof MupdfModule> {
  mupdfModule ??= import("mupdf");
  return mupdfModule;
}

export interface RasterPage {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
}

/**
 * Renders the given 1-based page numbers at the requested DPI. 300 DPI is a
 * good OCR default: legible glyphs without exploding memory on 100+ page docs.
 */
export async function rasterizePages(
  bytes: Buffer,
  pageNumbers: number[],
  dpi = 300,
): Promise<RasterPage[]> {
  const mupdf = await loadMupdf();
  const document = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const scale = mupdf.Matrix.scale(dpi / 72, dpi / 72);
    const out: RasterPage[] = [];
    for (const pageNumber of pageNumbers) {
      const page = document.loadPage(pageNumber - 1);
      try {
        const pix = page.toPixmap(scale, mupdf.ColorSpace.DeviceGray, false, true);
        out.push({
          pageNumber,
          png: Buffer.from(pix.asPNG()),
          width: pix.getWidth(),
          height: pix.getHeight(),
        });
        pix.destroy();
      } finally {
        page.destroy();
      }
    }
    return out;
  } finally {
    document.destroy();
  }
}
