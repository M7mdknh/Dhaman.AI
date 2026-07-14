import { describe, expect, it } from "vitest";

import {
  deriveDocumentViews,
  type DocumentEvent,
  type DocumentSnapshot,
} from "@/lib/processing";

const T0 = Date.parse("2026-07-11T10:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

function doc(overrides: Partial<DocumentSnapshot>): DocumentSnapshot {
  return {
    documentId: "doc-1",
    fileName: "fy2025.pdf",
    fiscalYear: 2025,
    status: "QUEUED",
    events: [],
    error: null,
    ...overrides,
  };
}

describe("deriveDocumentViews", () => {
  it("running: current stage, live elapsed, progress and remaining estimate", () => {
    const events: DocumentEvent[] = [
      { stage: "PREPARING", startedAt: at(0) },
      { stage: "READING_STATEMENTS", startedAt: at(400) },
      {
        stage: "DETECTING_STATEMENTS",
        startedAt: at(1100),
        note: "Reading scanned statement pages with AI vision",
      },
    ];
    const [view] = deriveDocumentViews(
      [doc({ status: "PROCESSING", events })],
      "RUNNING",
      T0 + 3100,
    );

    expect(view.state).toBe("running");
    expect(view.statusLabel).toBe("Detecting Financial Statements");
    expect(view.note).toBe("Reading scanned statement pages with AI vision");
    expect(view.elapsedMs).toBe(3100);
    expect(view.progressPct).toBeGreaterThan(0);
    expect(view.progressPct).toBeLessThan(100);
    expect(view.estRemainingMs).toBeGreaterThan(0);
    // Per-stage breakdown: earlier stages closed, the active one still counting.
    expect(view.timings.map((t) => [t.stage, t.durationMs, t.running])).toEqual([
      ["PREPARING", 400, false],
      ["READING_STATEMENTS", 700, false],
      ["DETECTING_STATEMENTS", 2000, true],
    ]);
  });

  it("completed: elapsed frozen at the terminal event, 100%", () => {
    const events: DocumentEvent[] = [
      { stage: "PREPARING", startedAt: at(0) },
      { stage: "EXTRACTING_DATA", startedAt: at(1000) },
      { stage: "COMPLETED", startedAt: at(4200) },
    ];
    const [view] = deriveDocumentViews(
      [doc({ status: "COMPLETED", events })],
      "RUNNING",
      T0 + 999_999, // far-future "now" must not inflate anything
    );
    expect(view.state).toBe("complete");
    expect(view.progressPct).toBe(100);
    expect(view.elapsedMs).toBe(4200);
    expect(view.timings[1].durationMs).toBe(3200);
    expect(view.timings.every((t) => !t.running)).toBe(true);
  });

  it("failed: names the exact stage and carries the human-readable reason", () => {
    const events: DocumentEvent[] = [
      { stage: "PREPARING", startedAt: at(0) },
      { stage: "READING_STATEMENTS", startedAt: at(300) },
      { stage: "FAILED", startedAt: at(2300) },
    ];
    const [view] = deriveDocumentViews(
      [doc({ status: "FAILED", events, error: "The PDF is password-protected." })],
      "FAILED",
      T0 + 10_000,
    );
    expect(view.state).toBe("failed");
    expect(view.statusLabel).toBe("Failed at Reading Financial Statements");
    expect(view.error).toBe("The PDF is password-protected.");
    expect(view.elapsedMs).toBe(2300);
  });

  it("queued while the job is queued: position and a start estimate, never bare 'Queued'", () => {
    const docs = [
      doc({ documentId: "a" }),
      doc({ documentId: "b", fiscalYear: 2024 }),
    ];
    const views = deriveDocumentViews(docs, "QUEUED", T0);
    expect(views[0].queuePosition).toBe(1);
    expect(views[1].queuePosition).toBe(2);
    for (const v of views) {
      expect(v.state).toBe("queued");
      expect(v.statusLabel).toMatch(/position \d.*starting in ~\d+s/);
      expect(v.estStartMs).toBeGreaterThan(0);
    }
  });

  it("queue positions count only documents that have not started", () => {
    const views = deriveDocumentViews(
      [
        doc({ documentId: "a", status: "COMPLETED", events: [{ stage: "COMPLETED", startedAt: at(0) }] }),
        doc({
          documentId: "b",
          status: "PROCESSING",
          events: [{ stage: "PREPARING", startedAt: at(0) }],
        }),
        doc({ documentId: "c" }),
      ],
      "RUNNING",
      T0 + 1000,
    );
    expect(views[0].state).toBe("complete");
    expect(views[1].state).toBe("running");
    expect(views[2].state).toBe("queued");
    expect(views[2].queuePosition).toBe(1);
  });

  it("queued under a dead job: no ticking countdown, an honest resume hint", () => {
    for (const jobState of ["FAILED", "COMPLETED"] as const) {
      const [view] = deriveDocumentViews([doc({})], jobState, T0);
      expect(view.state).toBe("queued");
      expect(view.statusLabel).toBe("Waiting to process — resume processing to continue");
      expect(view.estStartMs).toBeNull();
    }
  });

  it("skipped (express): an explicit, honest state", () => {
    const [view] = deriveDocumentViews([doc({ status: "SKIPPED" })], "RUNNING", T0);
    expect(view.state).toBe("skipped");
    expect(view.statusLabel).toContain("latest audited statement");
  });

  it("legacy completed document without events still renders complete", () => {
    const [view] = deriveDocumentViews([doc({ status: "COMPLETED", events: [] })], "COMPLETED", T0);
    expect(view.state).toBe("complete");
    expect(view.elapsedMs).toBeNull();
    expect(view.timings).toEqual([]);
  });
});
