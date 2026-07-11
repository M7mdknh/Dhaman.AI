/**
 * GPT-Vision extraction — the hybrid path for scanned/damaged statements.
 *
 * When a PDF has no usable text layer, the deterministic text pass returns
 * nothing, so instead of OCR-ing every page we render ONLY the statement pages
 * to images and ask a vision-capable model to return the canonical figures as
 * structured JSON. This is faster and far more reliable than tesseract on dense
 * Arabic-Indic tables, and it matches the product philosophy: the AI is the
 * document-understanding engine, extraction exists only to feed underwriting.
 *
 * Output is shaped as a synthetic `IfrsExtraction` so the rest of the pipeline
 * (persistence, financial analysis, caching) is completely unchanged. Vision
 * figures carry a provenance WARNING (never silently trusted as text-layer
 * figures are) so an officer verifies them before final decisioning.
 */
import { z } from "zod";

import { getLLMProvider } from "@/lib/ai";
import { env } from "@/lib/env";
import type { IfrsExtraction } from "@/lib/ifrs/extract";
import {
  CANONICAL_KEYS,
  KEY_HOME,
  type CanonicalKey,
  type FiguresByYear,
} from "@/lib/ifrs/normalizer";
import { StageTimer, STAGE } from "@/lib/ifrs/perf";
import { rasterizePages } from "@/lib/ifrs/raster";
import type { DocumentQualityReport } from "@/lib/ifrs/text-quality";

import type { LLMProvider } from "@/lib/ai/provider";
import type {
  DetectedStatement,
  ExtractedLineItem,
  StatementType,
  ValidationOutcome,
} from "@/lib/ifrs/types";

const SYSTEM_PROMPT =
  "You are a meticulous financial-statement data extractor for a corporate bank. " +
  "You read the primary IFRS statements (Statement of Financial Position, Statement of Profit or Loss, " +
  "Statement of Cash Flows), which may be in Arabic and/or English. You transcribe figures EXACTLY as " +
  "printed and never invent, estimate, or derive values that are not shown. Return ONLY strict JSON.";

// MINIMUM underwriting set only — no full statement reconstruction. Fewer
// requested fields = fewer output tokens = lower latency and a smaller
// failure surface on the Stage-1 critical path. The deterministic engine
// treats anything absent as "not printed" and renormalizes.
const CORE_FIELDS =
  "revenue, netIncome, cash, currentAssets, currentLiabilities, totalAssets, totalLiabilities, " +
  "totalEquity, operatingCashFlow, totalDebt";

const USER_PROMPT =
  `From the attached statement page images, extract ONLY the figures below for EACH fiscal year column shown ` +
  `(usually the reporting year and one comparative).\n` +
  `- Report ABSOLUTE amounts in the reporting currency: if figures are presented in thousands/millions, multiply them out to full units.\n` +
  `- Use NEGATIVE numbers for losses, net cash outflows, and any figure printed in parentheses.\n` +
  `- If a value is not printed on these pages, use null. Do not compute, derive, or estimate anything.\n\n` +
  `Fields: ${CORE_FIELDS}\n\n` +
  `Return ONLY strict JSON of exactly this shape — no explanations, no markdown:\n` +
  `{"currency": "SAR" | null, "years": [{"fiscalYear": 2025, "revenue": 120000000, "netIncome": 18000000, "...": null}]}`;

/** Vision output: a number or null for every canonical key, per fiscal year. */
const yearShape = Object.fromEntries(
  CANONICAL_KEYS.map((key) => [key, z.number().nullable().optional()]),
) as { [K in CanonicalKey]: z.ZodOptional<z.ZodNullable<z.ZodNumber>> };

const visionSchema = z.object({
  currency: z.string().min(1).max(8).nullable().optional(),
  years: z
    .array(z.object({ fiscalYear: z.number().int().min(1990).max(2100), ...yearShape }))
    .max(4),
});

type VisionYear = z.infer<typeof visionSchema>["years"][number];

function parseVisionJson(text: string): z.infer<typeof visionSchema> | null {
  const trimmed = text.trim();
  const candidate = trimmed.startsWith("{")
    ? trimmed
    : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  try {
    const parsed = visionSchema.safeParse(JSON.parse(candidate));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Statement pages first; else a bounded window of the pages needing vision. */
function pickVisionPages(
  quality: DocumentQualityReport,
  statements: DetectedStatement[],
  cap: number,
): number[] {
  const fromStatements = statements.flatMap((s) => s.pages);
  const pool =
    fromStatements.length > 0
      ? fromStatements
      : [
          ...quality.pages.filter((p) => p.quality === "IMAGE_ONLY").map((p) => p.pageNumber),
          ...quality.pages.filter((p) => p.quality === "DAMAGED_TEXT").map((p) => p.pageNumber),
        ];
  return [...new Set(pool)].sort((a, b) => a - b).slice(0, cap);
}

/** Builds `figures` + grouped provenance line items from the model's JSON.
 * Exported for tests: `figuresByYear(lineItems)` must reconstruct `figures`. */
export function toFigures(years: VisionYear[]): {
  figures: FiguresByYear;
  lineItems: ExtractedLineItem[];
} {
  const figures: FiguresByYear = new Map();
  const byKey = new Map<CanonicalKey, ExtractedLineItem>();

  for (const year of years) {
    const per: Partial<Record<CanonicalKey, string>> = {};
    for (const key of CANONICAL_KEYS) {
      const value = year[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const decimal = value.toFixed(2);
      per[key] = decimal;
      let item = byKey.get(key);
      if (!item) {
        item = {
          statement: (KEY_HOME[key][0] ?? "PROFIT_OR_LOSS") as StatementType,
          originalLabel: key,
          normalizedKey: key,
          values: [],
        };
        byKey.set(key, item);
      }
      item.values.push({ fiscalYear: year.fiscalYear, original: decimal, normalized: decimal });
    }
    if (Object.keys(per).length > 0) figures.set(year.fiscalYear, per);
  }
  return { figures, lineItems: [...byKey.values()] };
}

/** Statement types implied by which figures were found (for display only). */
function inferStatements(figures: FiguresByYear, pages: number[]): DetectedStatement[] {
  const keys = new Set<CanonicalKey>();
  for (const year of figures.values()) for (const k of Object.keys(year)) keys.add(k as CanonicalKey);
  const has = (...ks: CanonicalKey[]) => ks.some((k) => keys.has(k));
  const out: DetectedStatement[] = [];
  if (has("revenue", "netIncome", "cogs", "grossProfit")) out.push({ type: "PROFIT_OR_LOSS", pages });
  if (has("totalAssets", "cash", "totalEquity", "totalLiabilities"))
    out.push({ type: "FINANCIAL_POSITION", pages });
  if (has("operatingCashFlow", "investingCashFlow", "financingCashFlow"))
    out.push({ type: "CASH_FLOWS", pages });
  return out;
}

/**
 * Runs the vision extraction. Returns a synthetic `IfrsExtraction`, or null when
 * vision is unavailable / disabled / yielded no figures — so the caller can
 * fall back to the deterministic OCR path. Never throws.
 */
export async function extractViaVision(
  bytes: Buffer,
  quality: DocumentQualityReport,
  statements: DetectedStatement[],
  provider: LLMProvider = getLLMProvider(),
): Promise<IfrsExtraction | null> {
  if (!env.VISION_ENABLED || !provider.completeVisionJSON) return null;

  const pages = pickVisionPages(quality, statements, env.VISION_MAX_PAGES);
  if (pages.length === 0) return null;

  const timer = new StageTimer();
  try {
    const raster = await timer.time(STAGE.RASTERIZE, () =>
      rasterizePages(bytes, pages, env.VISION_DPI),
    );
    const images = raster.map((p) => `data:image/png;base64,${p.png.toString("base64")}`);

    const visionStarted = Date.now();
    const result = await timer.time(STAGE.VISION, () =>
      provider.completeVisionJSON!({
        system: SYSTEM_PROMPT,
        user: USER_PROMPT,
        images,
        maxOutputTokens: 1_500,
        temperature: 0,
        // Generous by design: aborting a vision call wastes a BILLED request
        // and drops us into the far slower OCR fallback. See env.ts.
        timeoutMs: env.VISION_TIMEOUT_MS,
      }),
    );

    const validationStarted = Date.now();
    const parsed = parseVisionJson(result.text);
    // Measurement: the model call is expected to dominate; validation ~0ms.
    console.log(
      "[vision-extraction]",
      JSON.stringify({
        stage: "measured",
        pages: pages.length,
        openaiMs: validationStarted - visionStarted,
        validationMs: Date.now() - validationStarted,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        parsed: Boolean(parsed),
        years: parsed?.years.length ?? 0,
      }),
    );
    if (!parsed || parsed.years.length === 0) return null;

    const { figures, lineItems } = toFigures(parsed.years);
    if (figures.size === 0) return null;

    const fiscalYears = [...figures.keys()].sort((a, b) => b - a);
    const detected = inferStatements(figures, pages);
    const validation: ValidationOutcome = {
      errors: [],
      warnings: [
        {
          code: "VISION_EXTRACTION",
          message:
            "Figures were read from scanned statement pages by GPT-Vision. Verify the key figures against the source document before final decisioning.",
        },
      ],
    };

    return {
      result: {
        currency: parsed.currency ?? null,
        scale: 1, // the model returns absolute amounts
        fiscalYears,
        companyName: null,
        statements: detected,
        lineItems,
      },
      figures,
      validation,
      meta: {
        textSource: "VISION",
        quality,
        ocrPages: [],
        ocrConfidence: null,
        valuesTrusted: true,
        perf: timer.report(),
      },
    };
  } catch (error) {
    console.error(
      "[vision-extraction]",
      JSON.stringify({
        pages,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }),
    );
    return null;
  }
}
