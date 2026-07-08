/**
 * Stage timing for the extraction pipeline. The MVP optimizes for user-visible
 * speed, so every stage is measured and rolled up into a performance report
 * that shows, per stage: duration, share of total, and an actionable
 * recommendation. Pure — no I/O, no framework, no Prisma.
 *
 * Percentages are computed against the SUMMED stage time (`measuredMs`), which
 * answers "where did the work go?". `wallMs` is the real elapsed time; for a
 * sequential pipeline the two are ~equal, but when a caller runs stages in
 * parallel (e.g. several documents at once) summed time exceeds wall time — the
 * report exposes both so the distinction is never hidden.
 */

/** Canonical stage names, shared across the pipeline and the service layer. */
export const STAGE = {
  STORAGE_READ: "storage_read",
  READ_TEXT: "read_pdf_text",
  ASSESS_QUALITY: "assess_quality",
  DETECT_PAGES: "detect_pages",
  RASTERIZE: "rasterize",
  OCR: "ocr",
  EXTRACT_LINES: "extract_line_items",
  NORMALIZE: "normalize_validate",
  FINANCIAL_ANALYSIS: "financial_analysis",
  AI_UNDERWRITING: "ai_underwriting",
} as const;

export interface StageRow {
  stage: string;
  durationMs: number;
  /** Share of `measuredMs` (summed stage time), 0-100, one decimal. */
  pct: number;
  /** Actionable tuning hint when this stage is a bottleneck, else null. */
  recommendation: string | null;
}

export interface PerfReport {
  /** Summed stage durations (the denominator for `pct`). */
  measuredMs: number;
  /** Real elapsed time from timer creation to `report()`. */
  wallMs: number;
  stages: StageRow[];
}

/**
 * Accumulates per-stage durations. Re-recording the same stage sums it (the
 * pipeline reports a stage once per document), so a case-level timer can
 * `absorb()` each document's report into one aggregate.
 */
export class StageTimer {
  private readonly totals = new Map<string, number>();
  private readonly order: string[] = [];
  private readonly startedAt = Date.now();

  record(stage: string, ms: number): void {
    if (!this.totals.has(stage)) this.order.push(stage);
    this.totals.set(stage, (this.totals.get(stage) ?? 0) + ms);
  }

  /** Times an async stage; the duration is recorded even if `fn` throws. */
  async time<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      this.record(stage, Date.now() - startedAt);
    }
  }

  /** Times a synchronous stage. */
  sync<T>(stage: string, fn: () => T): T {
    const startedAt = Date.now();
    try {
      return fn();
    } finally {
      this.record(stage, Date.now() - startedAt);
    }
  }

  /** Folds another report's stage totals into this timer (per-doc → case). */
  absorb(report: PerfReport): void {
    for (const row of report.stages) this.record(row.stage, row.durationMs);
  }

  report(): PerfReport {
    const measuredMs = [...this.totals.values()].reduce((sum, ms) => sum + ms, 0);
    const denominator = measuredMs || 1;
    const stages: StageRow[] = this.order.map((stage) => {
      const durationMs = this.totals.get(stage) ?? 0;
      const pct = Math.round((durationMs / denominator) * 1000) / 10;
      return { stage, durationMs, pct, recommendation: recommendFor(stage, pct, durationMs) };
    });
    return { measuredMs, wallMs: Date.now() - this.startedAt, stages };
  }
}

/**
 * Per-stage tuning advice, surfaced only when the stage is BOTH a large share
 * of the work AND slow in absolute terms — a stage that is 96% of an 80ms run
 * is not a bottleneck worth acting on. Kept declarative so the guidance stays
 * honest: no advice unless the data warrants it.
 */
function recommendFor(stage: string, pct: number, durationMs: number): string | null {
  switch (stage) {
    case STAGE.OCR:
    case STAGE.RASTERIZE:
      return pct >= 30 && durationMs >= 4000
        ? "OCR dominates — ask the client for the original digital auditor PDF (selectable text) to skip OCR entirely; otherwise lower OCR_DPI or OCR_MAX_PAGES."
        : null;
    case STAGE.READ_TEXT:
      return pct >= 45 && durationMs >= 3000
        ? "PDF text extraction dominates — the report is large. Only statement pages are parsed downstream; a trimmed financial-section PDF would read faster."
        : null;
    case STAGE.STORAGE_READ:
      return pct >= 25 && durationMs >= 1500
        ? "Object-storage read is slow — co-locate storage with compute or cache the bytes."
        : null;
    case STAGE.AI_UNDERWRITING:
      return pct >= 40 && durationMs >= 5000
        ? "AI memo generation is the slowest stage — it is best-effort and never gates underwriting; use a faster model or generate the memo lazily on first open."
        : null;
    case STAGE.FINANCIAL_ANALYSIS:
      return pct >= 30 && durationMs >= 1000
        ? "Financial analysis is unexpectedly heavy for a deterministic engine — profile the ratio computations."
        : null;
    default:
      return null;
  }
}

/** Stage-1 (≤3s) and whole-pipeline (≤10s) targets, with pass/fail verdicts. */
export const STAGE1_TARGET_MS = 3_000;
export const PIPELINE_TARGET_MS = 10_000;

/** Renders the two-stage target table (requirement: Stage / Duration / Target). */
export function formatStageTargets(stage1Ms: number, totalMs: number): string {
  const row = (label: string, ms: number, target: number) =>
    `  ${label.padEnd(38)}${`${ms}ms`.padStart(8)}  target ≤${target}ms  ${ms <= target ? "✅" : "❌"}`;
  return [
    "=== Stage targets ===",
    row("Stage 1 (Fast Financial Intelligence)", stage1Ms, STAGE1_TARGET_MS),
    row("Entire pipeline", totalMs, PIPELINE_TARGET_MS),
  ].join("\n");
}

/** Renders a report as a fixed-width block for structured logs / the CLI. */
export function formatPerfReport(report: PerfReport, title: string): string {
  const lines: string[] = [];
  lines.push(`=== Performance report: ${title} ===`);
  lines.push(
    `elapsed ${report.wallMs}ms` +
      (report.measuredMs !== report.wallMs ? ` (summed ${report.measuredMs}ms across stages)` : ""),
  );
  for (const row of report.stages) {
    const name = row.stage.padEnd(20);
    const ms = `${row.durationMs}ms`.padStart(8);
    const pct = `${row.pct.toFixed(1)}%`.padStart(6);
    lines.push(`  ${name}${ms}  ${pct}${row.recommendation ? `   ⚠ ${row.recommendation}` : ""}`);
  }
  return lines.join("\n");
}
