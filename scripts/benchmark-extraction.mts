/**
 * DEV TOOL: profiles the IFRS extraction engine on a REAL report so the MVP
 * speed targets can be verified (the in-repo fixtures are tiny). Runs the full
 * pipeline (with OCR enabled) and prints the per-stage performance report plus
 * a pass/fail against the target:
 *
 *   < 10s for a standard digital IFRS report (text layer)
 *   < 20s for a scanned/damaged report (OCR)
 *
 *   npx tsx scripts/benchmark-extraction.mts <file.pdf> [more.pdf ...]
 *   npx tsx scripts/benchmark-extraction.mts $(find uploads -name '*.pdf')
 */
import "dotenv/config";

import { readFile } from "node:fs/promises";

import { extractIfrs } from "@/lib/ifrs/extract";
import { terminateOcr } from "@/lib/ifrs/ocr";
import { formatPerfReport } from "@/lib/ifrs/perf";
import { coreFigureCoverage } from "@/lib/ifrs/normalizer";
import { CORE_FIGURE_KEYS } from "@/lib/ifrs/normalizer";

const DIGITAL_TARGET_MS = 10_000;
const SCANNED_TARGET_MS = 20_000;

async function benchmark(path: string): Promise<void> {
  const bytes = await readFile(path);
  const startedAt = Date.now();
  try {
    const { result, figures, validation, meta } = await extractIfrs(bytes, { enableOcr: true });
    const totalMs = Date.now() - startedAt;
    const target = meta.textSource === "TEXT_LAYER" ? DIGITAL_TARGET_MS : SCANNED_TARGET_MS;
    const verdict = totalMs <= target ? "✅ PASS" : "❌ OVER";

    console.log(`\n${"─".repeat(72)}\n${path}  (${(bytes.length / 1024).toFixed(0)} KB)`);
    console.log(formatPerfReport(meta.perf, "extraction"));
    console.log(
      [
        `total ${totalMs}ms  target ${target}ms  ${verdict}`,
        `source ${meta.textSource}  ocrPages ${meta.ocrPages.length}  trusted ${meta.valuesTrusted}`,
        `statements ${result.statements.map((s) => s.type).join(",") || "none"}`,
        `years ${result.fiscalYears.join(",") || "none"}  coreFigures ${coreFigureCoverage(figures)}/${CORE_FIGURE_KEYS.length}`,
        `blocking ${validation.errors.map((e) => e.code).join(",") || "none"}`,
      ].join("\n"),
    );
  } catch (error) {
    console.log(`\n${"─".repeat(72)}\n${path}\n❌ ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  }
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error("Usage: npx tsx scripts/benchmark-extraction.mts <file.pdf> [more.pdf ...]");
    process.exit(1);
  }
  for (const path of paths) await benchmark(path);
  await terminateOcr().catch(() => {});
}

void main();
