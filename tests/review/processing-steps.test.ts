import { describe, expect, it } from "vitest";

import {
  PROCESSING_STAGES,
  buildProcessingSteps,
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
    // The five pipeline stages sit in order between the framing steps.
    expect(steps.slice(2, -1).map((s) => s.key)).toEqual(PROCESSING_STAGES);
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
    expect(s.AI_UNDERWRITING).toBe("pending");
    expect(s.completed).toBe("pending");
  });

  it("completed: everything is complete", () => {
    const s = statesByKey(snapshot({ state: "COMPLETED", stage: "AI_UNDERWRITING" }));
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
    expect(s.AI_UNDERWRITING).toBe("pending");
    expect(s.completed).toBe("pending");
  });

  it("failed at the AI stage: only the last stage fails", () => {
    const s = statesByKey(
      snapshot({ state: "FAILED", stage: "AI_UNDERWRITING", failedStage: "AI_UNDERWRITING" }),
    );
    expect(s.READING_STATEMENTS).toBe("complete");
    expect(s.FINANCIAL_ANALYSIS).toBe("complete");
    expect(s.AI_UNDERWRITING).toBe("failed");
    expect(s.completed).toBe("pending");
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
