/**
 * OCR fallback for pages with a broken/absent text layer. Uses tesseract.js
 * with the Arabic + English models (Saudi audited statements are Arabic, often
 * with English labels). Recovered text is post-processed so downstream regexes
 * work: Arabic-Indic digits are converted to ASCII.
 *
 * Throughput: OCR is the pipeline's dominant cost (~seconds/page), so pages are
 * recognized in PARALLEL across a small pool of workers (OCR_CONCURRENCY). A
 * single tesseract Worker cannot run two `recognize` calls at once, so the pool
 * hands each page to a free worker and queues the rest. The pool is a
 * process-wide singleton: concurrent documents share it safely (per-worker work
 * is serialized) instead of each spinning up its own models.
 *
 * IMPORTANT (documented limitation): tesseract reliably recovers Arabic
 * LABELS/headings but NOT dense Arabic-Indic numeric tables. Numeric values
 * carry a per-page OCR confidence and are treated as low-trust downstream.
 */
import sharp from "sharp";

import { env } from "@/lib/env";
import { toWesternDigits } from "@/lib/ifrs/vocab";

import type { RasterPage } from "@/lib/ifrs/raster";
import type { Worker } from "tesseract.js";

export interface OcrPage {
  pageNumber: number;
  text: string;
  /** Mean tesseract confidence 0-100 for the page. */
  confidence: number;
}

/**
 * A fixed pool of tesseract workers. `run` acquires a free worker (waiting in
 * FIFO order when all are busy), runs the task, and returns the worker to the
 * pool. Sized once, on first use.
 */
class OcrPool {
  private readonly all: Worker[];
  private readonly idle: Worker[];
  private readonly waiters: Array<(worker: Worker) => void> = [];

  private constructor(workers: Worker[]) {
    this.all = workers;
    this.idle = [...workers];
  }

  static async create(size: number): Promise<OcrPool> {
    const { createWorker } = await import("tesseract.js");
    // The WASM core resolves from the bundled `tesseract.js-core` package, so
    // only the language traineddata is fetched. `cachePath` MUST be writable
    // (on Vercel the sole writable dir is /tmp) or tesseract errors caching the
    // download and re-fetches on every cold start. `langPath`/`corePath` can be
    // pointed at a private mirror to remove the public-CDN dependency entirely.
    const workers = await Promise.all(
      Array.from({ length: Math.max(1, size) }, () =>
        createWorker(["ara", "eng"], undefined, {
          cachePath: env.TESSERACT_CACHE_PATH,
          langPath: env.TESSERACT_LANG_PATH,
          corePath: env.TESSERACT_CORE_PATH,
        }),
      ),
    );
    return new OcrPool(workers);
  }

  private acquire(): Promise<Worker> {
    const worker = this.idle.pop();
    if (worker) return Promise.resolve(worker);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private release(worker: Worker): void {
    const next = this.waiters.shift();
    if (next) next(worker);
    else this.idle.push(worker);
  }

  async run<T>(task: (worker: Worker) => Promise<T>): Promise<T> {
    const worker = await this.acquire();
    try {
      return await task(worker);
    } finally {
      this.release(worker);
    }
  }

  async terminate(): Promise<void> {
    await Promise.all(this.all.map((worker) => worker.terminate()));
  }
}

let poolPromise: Promise<OcrPool> | null = null;

function getPool(): Promise<OcrPool> {
  poolPromise ??= OcrPool.create(env.OCR_CONCURRENCY);
  return poolPromise;
}

/** Releases the shared workers (call when a batch of documents is done). */
export async function terminateOcr(): Promise<void> {
  if (!poolPromise) return;
  const pool = await poolPromise;
  poolPromise = null;
  await pool.terminate();
}

/** Light preprocessing that improves OCR without distorting glyphs. */
async function preprocess(png: Buffer): Promise<Buffer> {
  return sharp(png).grayscale().normalize().png().toBuffer();
}

/** Recognizes every page in parallel across the shared worker pool. */
export async function ocrPages(pages: RasterPage[]): Promise<OcrPage[]> {
  if (pages.length === 0) return [];
  const pool = await getPool();
  return Promise.all(
    pages.map((page) =>
      pool.run(async (worker) => {
        const image = await preprocess(page.png);
        const { data } = await worker.recognize(image);
        return {
          pageNumber: page.pageNumber,
          text: toWesternDigits(data.text),
          confidence: Math.round(data.confidence),
        };
      }),
    ),
  );
}
