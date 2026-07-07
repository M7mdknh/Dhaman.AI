/**
 * OCR fallback for pages with a broken/absent text layer. Uses tesseract.js
 * with the Arabic + English models (Saudi audited statements are Arabic, often
 * with English labels). Recovered text is post-processed so downstream regexes
 * work: Arabic-Indic digits are converted to ASCII.
 *
 * IMPORTANT (documented limitation): tesseract reliably recovers Arabic
 * LABELS/headings but NOT dense Arabic-Indic numeric tables. Numeric values
 * carry a per-page OCR confidence and are treated as low-trust downstream.
 */
import sharp from "sharp";

import { toWesternDigits } from "@/lib/ifrs/vocab";

import type { RasterPage } from "@/lib/ifrs/raster";
import type { Worker } from "tesseract.js";

export interface OcrPage {
  pageNumber: number;
  text: string;
  /** Mean tesseract confidence 0-100 for the page. */
  confidence: number;
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import("tesseract.js");
    return createWorker(["ara", "eng"]);
  })();
  return workerPromise;
}

/** Releases the shared worker (call when a batch of documents is done). */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}

/** Light preprocessing that improves OCR without distorting glyphs. */
async function preprocess(png: Buffer): Promise<Buffer> {
  return sharp(png).grayscale().normalize().png().toBuffer();
}

export async function ocrPages(pages: RasterPage[]): Promise<OcrPage[]> {
  const worker = await getWorker();
  const out: OcrPage[] = [];
  for (const page of pages) {
    const image = await preprocess(page.png);
    const { data } = await worker.recognize(image);
    out.push({
      pageNumber: page.pageNumber,
      text: toWesternDigits(data.text),
      confidence: Math.round(data.confidence),
    });
  }
  return out;
}
