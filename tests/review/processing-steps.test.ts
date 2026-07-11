import { describe, expect, it } from "vitest";

import {
  PROCESSING_STAGES,
  buildProcessingSteps,
  deriveProgress,
  deriveStageTimings,
  isProcessingActive,
  type ProcessingSnapshot,
  type StepState,
} from "@/lib/processing";

function snapshot(overrides: Partial<ProcessingSnapshot>): ProcessingSnapshot {
  return {
    state: "QUEUED",
    stage: null,
    failedStage: null,
    attempts: 1,
    error: null,
    stageEvents: [],
    startedAt: null,
    completedAt: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Maps step key → state for concise assertions. */
function statesByKey(snap: ProcessingSnapshot): Record<string, StepState> {
  return Object.fromEntries(buildProcessingSteps(snap).map((s) => [s.key, s.state]));
}

describe("buildProcessingSteps", () => {
  it("always frames with two complete steps and a Completed cap", () => {
    const steps = buildProcessingSteps(snapshot({}));
    expect(steps[0].key).toBe("submitted");
    expect(steps[1].key).toBe("uploaded");
    expect(steps.at(-1)!.key).toBe("completed");
    // The pipeline stages sit in order between the framing steps. Two stages:
    // Stage 1 ends at FINANCIAL_ANALYSIS (headline ready); Stage 2 is the AI memo.
    expect(steps.slice(2, -1).map((s) => s.key)).toEqual(PROCESSING_STAGES);
    expect(PROCESSING_STAGES.at(-1)).toBe("AI_UNDERWRITING");
  });

  it("queued: framing complete, every stage pending", () => {
    const s = statesByKey(snapshot({ state: "QUEUED" }));
    expect(s.submitted).toBe("complete");
    expect(s.uploaded).toBe("complete");
    for (const stage of PROCESSING_STAGES) expect(s[stage]).toBe("pending");
    expect(s.completed).toBe("pending");
  });

  it("running: stages before the current are complete, current active, rest pending", () => {
    const s = statesByKey(snapshot({ state: "RUNNING", stage: "EXTRACTING_DATA" }));
    expect(s.READING_STATEMENTS).toBe("complete");
    expect(s.DETECTING_STATEMENTS).toBe("complete");
    expect(s.EXTRACTING_DATA).toBe("active");
    expect(s.FINANCIAL_ANALYSIS).toBe("pending");
    expect(s.completed).toBe("pending");
  });

  it("completed: everything is complete", () => {
    const s = statesByKey(snapshot({ state: "COMPLETED", stage: "FINANCIAL_ANALYSIS" }));
    for (const stage of PROCESSING_STAGES) expect(s[stage]).toBe("complete");
    expect(s.completed).toBe("complete");
  });

  it("failed: the failed stage is marked, earlier complete, later pending", () => {
    const s = statesByKey(
      snapshot({ state: "FAILED", stage: "EXTRACTING_DATA", failedStage: "EXTRACTING_DATA" }),
    );
    expect(s.READING_STATEMENTS).toBe("complete");
    expect(s.DETECTING_STATEMENTS).toBe("complete");
    expect(s.EXTRACTING_DATA).toBe("failed");
    expect(s.FINANCIAL_ANALYSIS).toBe("pending");
    expect(s.completed).toBe("pending");
  });

  it("failed at the final analysis stage: earlier complete, that stage failed", () => {
    const s = statesByKey(
      snapshot({ state: "FAILED", stage: "FINANCIAL_ANALYSIS", failedStage: "FINANCIAL_ANALYSIS" }),
    );
    expect(s.READING_STATEMENTS).toBe("complete");
    expect(s.EXTRACTING_DATA).toBe("complete");
    expect(s.FINANCIAL_ANALYSIS).toBe("failed");
    expect(s.completed).toBe("pending");
  });
});

describe("deriveProgress", () => {
  it("queued: 0% and Stage 1 not complete", () => {
    const p = deriveProgress(snapshot({ state: "QUEUED" }));
    expect(p.overallPct).toBe(0);
    expect(p.stage1Complete).toBe(false);
    expect(p.currentStepLabel).toBe("Queued");
  });

  it("advances the bar while running and names the current step", () => {
    const p = deriveProgress(snapshot({ state: "RUNNING", stage: "EXTRACTING_DATA" }));
    expect(p.overallPct).toBeGreaterThan(0);
    expect(p.overallPct).toBeLessThan(100);
    expect(p.currentStepLabel).toBe("Extracting Financial Data");
    expect(p.stage1Complete).toBe(false);
    expect(p.completedStepLabels).toContain("Reading Financial Statements");
  });

  it("flags Stage 1 complete once the AI (Stage 2) stage is active", () => {
    const p = deriveProgress(snapshot({ state: "RUNNING", stage: "AI_UNDERWRITING" }));
    expect(p.stage1Complete).toBe(true);
  });

  it("completed: 100% and no remaining time", () => {
    const p = deriveProgress(snapshot({ state: "COMPLETED", stage: "AI_UNDERWRITING" }));
    expect(p.overallPct).toBe(100);
    expect(p.estRemainingMs).toBe(0);
    expect(p.stage1Complete).toBe(true);
  });
});

describe("deriveStageTimings", () => {
  const t0 = Date.parse("2026-07-11T10:00:00.000Z");

  it("derives durations: a stage ends when the next begins", () => {
    const timings = deriveStageTimings(
      snapshot({
        state: "RUNNING",
        stage: "EXTRACTING_DATA",
        stageEvents: [
          { stage: "READING_STATEMENTS", startedAt: new Date(t0).toISOString() },
          { stage: "DETECTING_STATEMENTS", startedAt: new Date(t0 + 800).toISOString() },
          {
            stage: "EXTRACTING_DATA",
            startedAt: new Date(t0 + 2100).toISOString(),
            note: "Reading scanned statement pages with AI vision",
          },
        ],
      }),
      t0 + 6100,
    );

    expect(timings.READING_STATEMENTS).toMatchObject({ durationMs: 800, running: false });
    expect(timings.DETECTING_STATEMENTS).toMatchObject({ durationMs: 1300, running: false });
    expect(timings.EXTRACTING_DATA).toMatchObject({
      durationMs: 4000,
      running: true,
      note: "Reading scanned statement pages with AI vision",
    });
  });

  it("freezes the last stage at completedAt on finished runs", () => {
    const timings = deriveStageTimings(
      snapshot({
        state: "COMPLETED",
        stage: "AI_UNDERWRITING",
        completedAt: new Date(t0 + 9000).toISOString(),
        stageEvents: [
          { stage: "FINANCIAL_ANALYSIS", startedAt: new Date(t0).toISOString() },
          { stage: "AI_UNDERWRITING", startedAt: new Date(t0 + 500).toISOString() },
        ],
      }),
      t0 + 999_999, // "now" far in the future must not inflate the duration
    );
    expect(timings.AI_UNDERWRITING).toMatchObject({ durationMs: 8500, running: false });
  });

  it("returns empty for a run with no events", () => {
    expect(deriveStageTimings(snapshot({}))).toEqual({});
  });
});

describe("isProcessingActive", () => {
  it("is true only while queued or running", () => {
    expect(isProcessingActive("QUEUED")).toBe(true);
    expect(isProcessingActive("RUNNING")).toBe(true);
    expect(isProcessingActive("COMPLETED")).toBe(false);
    expect(isProcessingActive("FAILED")).toBe(false);
  });
});
