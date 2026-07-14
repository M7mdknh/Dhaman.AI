import { z } from "zod";

/**
 * An S3 credential: trimmed, and rejected if it still carries the angle
 * brackets or whitespace of an un-substituted placeholder (e.g. "<key>").
 * Such values sign requests with the wrong length and fail opaquely.
 */
function s3Credential(name: string) {
  return z
    .string()
    .min(1)
    .transform((v) => v.trim())
    .refine((v) => !/[<>\s]/.test(v), {
      message: `${name} contains angle brackets or whitespace — paste the raw key value, not a placeholder like "<key>".`,
    })
    .optional();
}

/**
 * Validated server environment. Import only from server-side code.
 * Fails fast at boot with a readable message instead of failing deep
 * inside a request.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // Root directory for the local-disk storage adapter (relative to cwd).
  // Used only when no S3 bucket is configured (i.e. local development).
  UPLOAD_DIR: z.string().min(1).default("uploads"),

  // ---- Document storage (S3-compatible object store). Required in any
  // read-only-filesystem deployment (e.g. Vercel); when S3_BUCKET is unset
  // the app falls back to the local-disk adapter for development.
  // Works with AWS S3 and S3-compatible stores (Cloudflare R2, MinIO) via
  // S3_ENDPOINT. Buckets MUST be private — objects are read server-side and
  // streamed through the access-checked download route, never linked directly.
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  // Credentials are trimmed and must not carry placeholder brackets or
  // whitespace: a value like "<abc>" is a length-34 key the S3 signer rejects
  // locally (before any request) with an opaque InvalidArgument — fail here
  // instead, with a message that names the mistake.
  S3_ACCESS_KEY_ID: s3Credential("S3_ACCESS_KEY_ID"),
  S3_SECRET_ACCESS_KEY: s3Credential("S3_SECRET_ACCESS_KEY"),
  // Custom endpoint for non-AWS providers (e.g. Cloudflare R2). Omit for AWS.
  S3_ENDPOINT: z.string().url().optional(),
  // Path-style addressing (true for MinIO/some R2 setups; false for AWS).
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // ---- Decision Intelligence (all optional — without a key the app runs
  // with the deterministic MockProvider and stays fully deployable).
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  // Vision EXTRACTION model (separate from the memo model above): reading
  // scanned statement figures is the Express critical path, so it gets the
  // strongest vision reader. If OpenAI reports this model unavailable (404),
  // the provider retries the request once on gpt-4o automatically.
  OPENAI_VISION_MODEL: z.string().min(1).default("gpt-4.1"),
  // Force a provider regardless of key presence ("mock" | "openai").
  LLM_PROVIDER: z.enum(["openai", "mock"]).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  // Vision extraction sits on the Stage-1 critical path, but aborting it early
  // is the worst of all worlds: OpenAI BILLS the completed request while the
  // client has already discarded it, and the pipeline falls into the far
  // slower OCR path. A multi-image vision request on a real scanned statement
  // routinely needs 15–40s, so the default waits it out — the live stage
  // dashboard tells the user exactly what is happening in the meantime.
  VISION_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  // Wall-clock budget for the last-resort OCR fallback (per document). On
  // timeout the document FAILS with an honest message instead of leaving the
  // job RUNNING forever — orchestration guard, not an OCR quality knob.
  OCR_FALLBACK_BUDGET_MS: z.coerce.number().int().positive().default(120_000),

  // ---- Underwriting mode. EVERY uploaded statement is processed in BOTH
  // modes (newest first; the first success flips the case ANALYSIS_READY and
  // the rest enrich in the background). EXPRESS (default) optimizes for the
  // fastest believable assessment: a scanned document that vision cannot read
  // fails fast (no slow OCR fallback) and the AI memo is generated lazily (on
  // first officer open), never on the contractor's critical path.
  // COMPREHENSIVE adds the OCR fallback and generates the memo eagerly in the
  // background. The deterministic engines are identical in both modes.
  UNDERWRITING_MODE: z.enum(["express", "comprehensive"]).default("express"),

  // ---- OCR (tesseract.js). The WASM core resolves from node_modules; only
  // the language traineddata is fetched, and by default from a public CDN.
  // To remove that runtime CDN dependency, point TESSERACT_LANG_PATH at a
  // directory/URL that hosts `ara.traineddata.gz` + `eng.traineddata.gz`.
  // TESSERACT_CACHE_PATH MUST be writable (Vercel's only writable dir is /tmp)
  // or tesseract re-downloads on every cold start and errors writing its cache.
  TESSERACT_LANG_PATH: z.string().min(1).optional(),
  TESSERACT_CORE_PATH: z.string().min(1).optional(),
  TESSERACT_CACHE_PATH: z.string().min(1).default("/tmp/tessdata"),
  // OCR speed/quality knobs (the MVP optimizes for speed — see
  // docs/IFRS_ENGINE.md "Performance"). Concurrency = number of parallel
  // tesseract workers; each holds the ara+eng models in memory, so raise it
  // only on a box with headroom. DPI trades legibility for speed (OCR numerics
  // are low-trust and gated regardless, so 200 is a safe default). Max pages
  // caps how many pages are ever rasterized+OCR'd for one document.
  OCR_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  OCR_DPI: z.coerce.number().int().min(120).max(400).default(200),
  OCR_MAX_PAGES: z.coerce.number().int().min(1).max(60).default(10),

  // ---- GPT-Vision extraction (the document-understanding path). When a
  // document has no usable text layer (scanned/damaged), the statement page
  // IMAGES are sent to a vision-capable model (OPENAI_VISION_MODEL). This is
  // the ONLY reader for scanned statements in Express; Comprehensive may still
  // degrade to the OCR fallback when vision is unavailable.
  VISION_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Pages rasterized+sent to the model (statement pages only). Bounds cost/latency.
  VISION_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(5),
  // Rasterization DPI for vision images. 150 is legible for figures yet compact.
  VISION_DPI: z.coerce.number().int().min(96).max(300).default(150),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
  S3_BUCKET: process.env.S3_BUCKET,
  S3_REGION: process.env.S3_REGION,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS,
  VISION_TIMEOUT_MS: process.env.VISION_TIMEOUT_MS,
  OCR_FALLBACK_BUDGET_MS: process.env.OCR_FALLBACK_BUDGET_MS,
  UNDERWRITING_MODE: process.env.UNDERWRITING_MODE,
  TESSERACT_LANG_PATH: process.env.TESSERACT_LANG_PATH,
  TESSERACT_CORE_PATH: process.env.TESSERACT_CORE_PATH,
  TESSERACT_CACHE_PATH: process.env.TESSERACT_CACHE_PATH,
  OCR_CONCURRENCY: process.env.OCR_CONCURRENCY,
  OCR_DPI: process.env.OCR_DPI,
  OCR_MAX_PAGES: process.env.OCR_MAX_PAGES,
  VISION_ENABLED: process.env.VISION_ENABLED,
  VISION_MAX_PAGES: process.env.VISION_MAX_PAGES,
  VISION_DPI: process.env.VISION_DPI,
});
