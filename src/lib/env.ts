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
  // Force a provider regardless of key presence ("mock" | "openai").
  LLM_PROVIDER: z.enum(["openai", "mock"]).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
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
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS,
});
