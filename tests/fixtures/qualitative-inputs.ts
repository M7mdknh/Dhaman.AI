/**
 * QualitativeInputs builder for engine tests. Defaults describe a clean,
 * established contractor (every component at or near full safety); tests
 * override exactly the answers they exercise.
 */
import { Prisma } from "@/generated/prisma/client";

import type { QualitativeInputs } from "@/lib/finance/types";

const D = (n: number) => new Prisma.Decimal(n);

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** A CR issued `years` ago (relative — operating age derives from "now"). */
export function crIssuedYearsAgo(years: number): Date {
  return new Date(Date.now() - years * YEAR_MS);
}

export function qualitativeInputs(over: Partial<QualitativeInputs> = {}): QualitativeInputs {
  return {
    crIssueDate: crIssuedYearsAgo(12),
    crActivities: "Road construction, infrastructure works",
    contractorClassification: "GRADE_2",
    partOfGroup: false,
    gmExperienceYears: 15,
    ownershipChanged: false,
    nitaqatBand: "GREEN",
    ongoingLitigation: false,
    projectsCompletedBand: "OVER_25",
    largestProjectValue: D(80_000_000),
    hadProjectIssues: false,
    guaranteeCalled: false,
    sameTypeExperience: true,
    runningProjectsCount: 4,
    backlogValue: D(20_000_000),
    outstandingGuarantees: D(5_000_000),
    equipmentPlan: "OWNED",
    heavyHiringNeeded: false,
    conductIncidents: false,
    auditorTier: "BIG_FOUR",
    fundingSource: "OWN_CASH",
    companySector: "Infrastructure",
    ...over,
  };
}
