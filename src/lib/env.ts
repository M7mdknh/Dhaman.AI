import { z } from "zod";

/**
 * Validated server environment. Import only from server-side code.
 * Fails fast at boot with a readable message instead of failing deep
 * inside a request.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // Root directory for the local-disk storage adapter (relative to cwd).
  UPLOAD_DIR: z.string().min(1).default("uploads"),

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
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS,
});
