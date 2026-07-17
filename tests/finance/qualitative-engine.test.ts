/**
 * Qualitative (KYC) pillar — hand-computed expectations against the
 * QUALITATIVE thresholds, plus the hard caps and flags that the killer
 * answers raise. Same conventions as the risk engine: safety sub-scores,
 * missing inputs excluded and renormalized, published score = inverse.
 */
import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  assessQualitative,
  capacityHeadroomRatio,
  detectQualitativeCaps,
  detectQualitativeFlags,
} from "@/services/finance/qualitative-score-service";

import { contractInputs } from "../fixtures/contract-inputs";
import { crIssuedYearsAgo, qualitativeInputs } from "../fixtures/qualitative-inputs";
import { EMPTY_YEAR } from "../fixtures/year-financials";

const D = (n: number) => new Prisma.Decimal(n);

const CONTRACT = contractInputs({
  contractValue: D(60_000_000),
  guaranteeAmount: D(6_000_000),
  beneficiaryType: "GOVERNMENT",
  durationMonths: 24,
});

/** Latest audited year: only revenue/equity matter to this pillar. */
const LATEST = { ...EMPTY_YEAR, revenue: D(160_000_000), totalEquity: D(40_000_000) };

describe("qualitative score engine (hand-computed)", () => {
  it("scores a clean, established contractor as excellent", () => {
    // age 12y→1×17 · projects OVER_25→1×11 · same-type→1×11 · stable→1×5 ·
    // GREEN→0.7×11=7.7 · headroom (20+60)/160=0.5→1×17 · no hiring→1×6 ·
    // clean conduct→1×11 · Big-4→1×11 ⇒ safety 96.7/100 ⇒ 3.
    const result = assessQualitative(qualitativeInputs(), CONTRACT, LATEST);
    expect(result.score).toBe(3);
    expect(result.band).toBe("EXCELLENT");
    expect(result.missingInputs).toEqual([]);
  });

  it("excludes capacity headroom (and renormalizes) when revenue is missing", () => {
    const result = assessQualitative(qualitativeInputs(), CONTRACT, EMPTY_YEAR);
    // Same components minus headroom: safety (96.7−17)/(100−17) = 79.7/83.
    expect(result.score).toBe(Math.round((1 - 79.7 / 83) * 100));
    expect(result.missingInputs).toEqual(["Capacity headroom (computed)"]);
  });

  it("punishes the young, over-committed, unaudited profile", () => {
    const result = assessQualitative(
      qualitativeInputs({
        crIssueDate: crIssuedYearsAgo(2),
        projectsCompletedBand: "UNDER_5",
        sameTypeExperience: false,
        ownershipChanged: true,
        nitaqatBand: "YELLOW",
        backlogValue: D(600_000_000),
        heavyHiringNeeded: true,
        auditorTier: "UNAUDITED",
      }),
      CONTRACT,
      LATEST,
    );
    // age 2y→0 · UNDER_5→0.1×11=1.1 · no same-type→0 · changed→0 ·
    // YELLOW→0.3×11=3.3 · headroom 4.125×→0 · hiring 0.2×6=1.2 ·
    // clean conduct→11 · unaudited→0 ⇒ safety 16.6/100 ⇒ 83 CRITICAL.
    expect(result.score).toBe(83);
    expect(result.band).toBe("CRITICAL");
  });

  it("computes the capacity headroom ratio from backlog + contract vs revenue", () => {
    expect(capacityHeadroomRatio(qualitativeInputs(), CONTRACT, LATEST)).toBeCloseTo(0.5, 5);
    expect(capacityHeadroomRatio(qualitativeInputs(), CONTRACT, EMPTY_YEAR)).toBeNull();
  });
});

describe("qualitative hard caps", () => {
  it("raises no caps for a clean profile", () => {
    expect(detectQualitativeCaps(qualitativeInputs())).toEqual([]);
  });

  it("caps a called guarantee, declared conduct incidents, and Nitaqat RED at manual review", () => {
    const caps = detectQualitativeCaps(
      qualitativeInputs({ guaranteeCalled: true, conductIncidents: true, nitaqatBand: "RED" }),
    );
    expect(caps.map((c) => c.type).sort()).toEqual([
      "CONDUCT_INCIDENT_DECLARED",
      "GUARANTEE_PREVIOUSLY_CALLED",
      "NITAQAT_RED",
    ]);
    for (const cap of caps) expect(cap.ceiling).toBe("MANUAL_REVIEW");
  });
});

describe("qualitative flags", () => {
  it("stays quiet on the clean profile", () => {
    expect(detectQualitativeFlags(qualitativeInputs(), CONTRACT, LATEST)).toEqual([]);
  });

  it("flags killer signals HIGH and orders by severity", () => {
    const flags = detectQualitativeFlags(
      qualitativeInputs({
        guaranteeCalled: true,
        ownershipChanged: true,
        ongoingLitigation: true,
      }),
      CONTRACT,
      LATEST,
    );
    expect(flags.map((f) => f.type)).toEqual([
      "GUARANTEE_PREVIOUSLY_CALLED",
      "ONGOING_LITIGATION",
      "OWNERSHIP_CHANGE",
    ]);
    expect(flags[0].severity).toBe("HIGH");
  });

  it("flags capacity strain when the committed load dwarfs revenue", () => {
    const flags = detectQualitativeFlags(
      qualitativeInputs({ backlogValue: D(600_000_000) }),
      CONTRACT,
      LATEST,
    );
    const strain = flags.find((f) => f.type === "CAPACITY_STRAIN");
    expect(strain?.severity).toBe("HIGH"); // (600+60)/160 = 4.125× ≥ 4×
  });

  it("flags aggregate guarantee burden above equity (the within-Daman over-issuance check)", () => {
    const flags = detectQualitativeFlags(
      qualitativeInputs({ outstandingGuarantees: D(90_000_000) }),
      CONTRACT,
      LATEST,
    );
    const burden = flags.find((f) => f.type === "GUARANTEE_BURDEN");
    expect(burden?.severity).toBe("HIGH"); // (90+6)/40 = 2.4× ≥ 2×
  });

  it("flags a sector mismatch between the company profile and the contract", () => {
    const flags = detectQualitativeFlags(
      qualitativeInputs({ companySector: "Information Technology" }),
      CONTRACT,
      LATEST,
    );
    expect(flags.some((f) => f.type === "SECTOR_MISMATCH")).toBe(false); // contract sector null
    const withSector = detectQualitativeFlags(
      qualitativeInputs({ companySector: "Information Technology" }),
      { ...CONTRACT, sector: "Infrastructure" },
      LATEST,
    );
    expect(withSector.some((f) => f.type === "SECTOR_MISMATCH")).toBe(true);
  });
});
