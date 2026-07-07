import { describe, expect, it } from "vitest";

import { formatPerfReport, StageTimer, STAGE } from "@/lib/ifrs/perf";

describe("StageTimer", () => {
  it("sums repeated stages and computes shares against measured time", () => {
    const timer = new StageTimer();
    timer.record(STAGE.READ_TEXT, 60);
    timer.record(STAGE.OCR, 30);
    timer.record(STAGE.READ_TEXT, 10); // same stage again → summed

    const report = timer.report();
    const read = report.stages.find((s) => s.stage === STAGE.READ_TEXT)!;
    const ocr = report.stages.find((s) => s.stage === STAGE.OCR)!;

    expect(report.measuredMs).toBe(100);
    expect(read.durationMs).toBe(70);
    expect(read.pct).toBe(70);
    expect(ocr.pct).toBe(30);
  });

  it("absorbs a child report into the aggregate", () => {
    const child = new StageTimer();
    child.record(STAGE.OCR, 200);
    const parent = new StageTimer();
    parent.record(STAGE.STORAGE_READ, 50);
    parent.absorb(child.report());

    const report = parent.report();
    expect(report.stages.map((s) => s.stage)).toContain(STAGE.OCR);
    expect(report.stages.find((s) => s.stage === STAGE.OCR)!.durationMs).toBe(200);
  });

  it("only recommends when a stage is both dominant AND slow", () => {
    const fast = new StageTimer();
    fast.record(STAGE.READ_TEXT, 80); // 100% share but trivial — no advice
    expect(fast.report().stages[0].recommendation).toBeNull();

    const slow = new StageTimer();
    slow.record(STAGE.OCR, 12_000);
    slow.record(STAGE.READ_TEXT, 500);
    const ocr = slow.report().stages.find((s) => s.stage === STAGE.OCR)!;
    expect(ocr.recommendation).toMatch(/OCR dominates/);
  });

  it("times a sync stage and records its duration", () => {
    const timer = new StageTimer();
    const value = timer.sync(STAGE.DETECT_PAGES, () => 42);
    expect(value).toBe(42);
    expect(timer.report().stages.some((s) => s.stage === STAGE.DETECT_PAGES)).toBe(true);
  });

  it("formats a readable report block", () => {
    const timer = new StageTimer();
    timer.record(STAGE.READ_TEXT, 10);
    const text = formatPerfReport(timer.report(), "unit test");
    expect(text).toContain("Performance report: unit test");
    expect(text).toContain(STAGE.READ_TEXT);
  });
});
