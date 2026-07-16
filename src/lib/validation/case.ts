import { z } from "zod";

import {
  CURRENCY_OPTIONS,
  EARLIEST_STATEMENT_YEAR,
  isAcceptedStatementYear,
  LATEST_STATEMENT_YEAR,
  SECTOR_OPTIONS,
} from "@/lib/case-constants";

/**
 * Money enters the system as decimal strings and is handed to Prisma.Decimal
 * unchanged — no float arithmetic. Comparisons here use a precise
 * string-based compare, not parseFloat.
 */
function moneyString(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(
      /^\d{1,16}(\.\d{1,2})?$/,
      `${label} must be a positive number with up to 2 decimal places`,
    )
    .refine((v) => compareDecimalStrings(v, "0") > 0, `${label} must be greater than zero`);
}

/** Precise compare of two non-negative decimal strings (-1 | 0 | 1). */
export function compareDecimalStrings(a: string, b: string): number {
  const [aInt = "0", aFrac = ""] = a.split(".");
  const [bInt = "0", bFrac = ""] = b.split(".");
  const width = Math.max(aInt.length, bInt.length);
  const fracWidth = Math.max(aFrac.length, bFrac.length);
  const na = aInt.padStart(width, "0") + aFrac.padEnd(fracWidth, "0");
  const nb = bInt.padStart(width, "0") + bFrac.padEnd(fracWidth, "0");
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/** Money that may legitimately be zero (backlog, outstanding guarantees). */
function nonNegativeMoneyString(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(
      /^\d{1,16}(\.\d{1,2})?$/,
      `${label} must be a non-negative number with up to 2 decimal places`,
    );
}

/** Percentage as a decimal string, 0–max inclusive (Prisma Decimal-safe). */
function percentString(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d{1,3}(\.\d{1,2})?$/, `${label} must be a number with up to 2 decimal places`)
    .refine(
      (v) => compareDecimalStrings(v, String(max)) <= 0,
      `${label} must be at most ${max}%`,
    );
}

/** Whole-number field entered as a string (form inputs stay string-typed,
 * like the money fields); the case service converts on save. */
function intString(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d{1,3}$/, `${label} must be a whole number`)
    .refine((v) => Number(v) <= max, `${label} must be at most ${max}`);
}

/** Yes/No selects — string enum in the form, converted to boolean on save. */
const yesNo = z.enum(["YES", "NO"], "Select yes or no");

/** Optional explanation textarea attached to a Yes/No question. */
const optionalNote = (max = 1000) =>
  z.string().trim().max(max, `Must be under ${max.toLocaleString()} characters`).optional().or(z.literal(""));

/**
 * KYC questionnaire (wizard Step 2 → CaseQualitative). Every "if yes,
 * describe" pair enforces its description when — and only when — the answer
 * is yes, so the short path stays short.
 */
export const caseQualitativeSchema = z
  .object({
    // 1A — company profile
    crIssueDate: z.iso.date("Enter the CR issuance date"),
    crActivities: z
      .string()
      .trim()
      .min(3, "List the activities registered on the CR")
      .max(500),
    contractorClassification: z
      .enum(["MOMTAZ", "GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "NONE"], "Select the classification")
      .optional()
      .or(z.literal("")),
    partOfGroup: yesNo,
    groupName: optionalNote(160),
    gmName: z.string().trim().min(2, "Enter the general manager's name").max(120),
    gmExperienceYears: intString("GM years of experience", 60),
    ownershipChanged: yesNo,
    ownershipChangeNote: optionalNote(),
    nitaqatBand: z.enum(["PLATINUM", "GREEN", "YELLOW", "RED"], "Select the Nitaqat band"),
    ongoingLitigation: yesNo,
    litigationNote: optionalNote(),
    // 1B — track record
    projectsCompletedBand: z.enum(
      ["UNDER_5", "FROM_5_TO_10", "FROM_10_TO_25", "OVER_25"],
      "Select the number of completed projects",
    ),
    largestProjectValue: nonNegativeMoneyString("Largest completed project value"),
    hadProjectIssues: yesNo,
    projectIssuesNote: optionalNote(),
    guaranteeCalled: yesNo,
    guaranteeCalledNote: optionalNote(),
    sameTypeExperience: yesNo,
    sameTypeExperienceNote: optionalNote(),
    // 1C — workload & capacity
    runningProjectsCount: intString("Running projects", 500),
    backlogValue: nonNegativeMoneyString("Remaining value of running projects"),
    outstandingGuarantees: nonNegativeMoneyString("Outstanding guarantees"),
    equipmentPlan: z.enum(["OWNED", "RENT", "PURCHASE"], "Select the equipment plan"),
    heavyHiringNeeded: yesNo,
    // 1D — financial conduct
    mainBank: z.string().trim().min(2, "Select the main operating bank").max(80),
    conductIncidents: yesNo,
    conductIncidentsNote: optionalNote(),
    auditorTier: z.enum(
      ["BIG_FOUR", "ACCREDITED_LOCAL", "OTHER_FIRM", "UNAUDITED"],
      "Select who audits the financials",
    ),
    auditorName: optionalNote(160),
    fundingSource: z.enum(
      ["OWN_CASH", "THIS_BANK", "OTHER_BANK", "SUPPLIER_CREDIT"],
      "Select how the project is funded until first payment",
    ),
  })
  .superRefine((d, ctx) => {
    const cr = new Date(d.crIssueDate);
    const now = new Date();
    if (cr > now) {
      ctx.addIssue({ code: "custom", path: ["crIssueDate"], message: "The CR issuance date cannot be in the future" });
    }
    if (cr.getFullYear() < 1950) {
      ctx.addIssue({ code: "custom", path: ["crIssueDate"], message: "Enter the date printed on the CR certificate" });
    }
    const requiredWhenYes: [keyof typeof d, keyof typeof d, string][] = [
      ["partOfGroup", "groupName", "Enter the group name"],
      ["ownershipChanged", "ownershipChangeNote", "Describe the ownership or management change"],
      ["ongoingLitigation", "litigationNote", "Describe the litigation or labor issue"],
      ["hadProjectIssues", "projectIssuesNote", "Describe what happened"],
      ["guaranteeCalled", "guaranteeCalledNote", "Describe the guarantee call"],
      ["conductIncidents", "conductIncidentsNote", "Describe the incident(s)"],
    ];
    for (const [flag, note, message] of requiredWhenYes) {
      if (d[flag] === "YES" && !String(d[note] ?? "").trim()) {
        ctx.addIssue({ code: "custom", path: [note], message });
      }
    }
    if (d.auditorTier !== "UNAUDITED" && !String(d.auditorName ?? "").trim()) {
      ctx.addIssue({ code: "custom", path: ["auditorName"], message: "Enter the audit firm's name" });
    }
  });

export const companyInfoSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(160),
  crNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Commercial Registration must be a 10-digit number"),
  sector: z.enum(SECTOR_OPTIONS, "Select a sector"),
  city: z.string().trim().min(2, "Enter the company city").max(80),
  contactPerson: z.string().trim().min(2, "Enter the contact person's name").max(120),
  contactEmail: z.email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s()-]{7,20}$/, "Enter a valid phone number"),
});

export const contractDetailsSchema = z
  .object({
    beneficiary: z.string().trim().min(2, "Enter the beneficiary name").max(160),
    beneficiaryType: z.enum(["GOVERNMENT", "PRIVATE"], "Select government or private"),
    contractTitle: z.string().trim().min(3, "Enter the contract title").max(200),
    contractDescription: z
      .string()
      .trim()
      .max(2000, "Description must be under 2,000 characters")
      .optional()
      .or(z.literal("")),
    sector: z.enum(SECTOR_OPTIONS, "Select the contract sector"),
    contractValue: moneyString("Contract value"),
    currency: z.enum(CURRENCY_OPTIONS, "Select a currency"),
    // Never rendered as a form input and never read from submitted values —
    // the case service always recomputes it from contractValue and
    // guaranteePercentage. Kept in the shape only so display components
    // (ContractSummary etc.) can read it via ContractDetailsInput.
    guaranteeAmount: z.string().optional(),
    guaranteeType: z.enum(
      ["BID_BOND", "PERFORMANCE", "ADVANCE_PAYMENT", "RETENTION", "LETTER_OF_CREDIT"],
      "Select a guarantee type",
    ),
    // The guarantee amount is never entered directly — it is derived from
    // this ratio (guaranteeAmount = contractValue * guaranteePercentage / 100)
    // by the case service so it can never drift from the two inputs.
    guaranteePercentage: z
      .string()
      .trim()
      .min(1, "Guarantee ratio is required")
      .regex(/^\d{1,3}(\.\d{1,2})?$/, "Ratio must be a number with up to 2 decimal places")
      .refine(
        (v) => compareDecimalStrings(v, "100") <= 0 && compareDecimalStrings(v, "0") > 0,
        "Ratio must be between 0 and 100",
      ),
    projectStartDate: z.iso.date("Select the project start date"),
    projectEndDate: z.iso.date("Select the project end date"),
    projectLocation: z.string().trim().min(2, "Enter the project location").max(160),
    additionalNotes: z
      .string()
      .trim()
      .max(2000, "Notes must be under 2,000 characters")
      .optional()
      .or(z.literal("")),

    // ---- 2A. Contractor role
    contractorRole: z.enum(["MAIN_CONTRACTOR", "SUBCONTRACTOR"], "Select the contractor role"),
    mainContractorName: optionalNote(160),
    backToBackPayment: z.enum(["YES", "NO"]).optional().or(z.literal("")),
    awardMethod: z.enum(
      ["PUBLIC_TENDER", "LIMITED_TENDER", "DIRECT_AWARD"],
      "Select how the contract was won",
    ),
    priorContractsWithBeneficiary: intString("Prior contracts (0 if none)", 500),

    // ---- 2B. Payment mechanics (structured — replaces free-text terms)
    advancePaymentPct: percentString("Advance payment", 30),
    billingCycle: z.enum(["MONTHLY", "MILESTONE", "OTHER"], "Select the billing cycle"),
    retentionPct: percentString("Retention", 10),
    paymentPeriodDays: z.enum(["30", "60", "90", "120"], "Select the payment period"),
    paymentNotes: optionalNote(500),

    // ---- 2C. Bond requirements per the contract text
    requiredBondPct: percentString("Required bond percentage", 100),
    bondValidityDate: z.iso.date("Select the required bond validity date"),
    onFirstDemand: yesNo,
    extendOrPay: yesNo,

    // ---- 2D. Penalty clauses
    ldRatePctPerWeek: percentString("Liquidated damages rate", 10),
    ldCapPct: percentString("Liquidated damages cap", 100),

    // ---- 2E. Execution plan
    mobilizationWeeks: intString("Mobilization period (weeks)", 104),
    keySuppliersIdentified: yesNo,
    keySuppliersNote: optionalNote(500),
    expectedGrossMarginPct: percentString("Expected gross margin", 100),
  })
  .refine((d) => d.projectEndDate > d.projectStartDate, {
    message: "Project end date must be after the start date",
    path: ["projectEndDate"],
  })
  .superRefine((d, ctx) => {
    if (d.contractorRole === "SUBCONTRACTOR") {
      if (!String(d.mainContractorName ?? "").trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["mainContractorName"],
          message: "Enter the main contractor's name",
        });
      }
      if (d.backToBackPayment !== "YES" && d.backToBackPayment !== "NO") {
        ctx.addIssue({
          code: "custom",
          path: ["backToBackPayment"],
          message: "State whether payment terms are back-to-back",
        });
      }
    }
    // The bond must outlive the project (contract period + buffer).
    if (d.bondValidityDate && d.projectEndDate && d.bondValidityDate < d.projectEndDate) {
      ctx.addIssue({
        code: "custom",
        path: ["bondValidityDate"],
        message: "Bond validity must extend to the project end date or beyond",
      });
    }
  });

export const statementYearSchema = z.coerce
  .number()
  .int()
  .refine(isAcceptedStatementYear, {
    message: `Fiscal year must be between ${EARLIEST_STATEMENT_YEAR} and ${LATEST_STATEMENT_YEAR}`,
  });

/** Body of the presign request (direct-to-storage upload, step 1). Size and
 * type are re-verified server-side against the actual bytes at finalize. */
/** Reliability class the applicant declares per uploaded statement. */
export const statementTypeSchema = z.enum(["AUDITED", "REVIEWED", "MANAGEMENT"]);

export const presignStatementSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  fileType: z.string().max(100),
  fiscalYear: statementYearSchema,
  statementType: statementTypeSchema.default("AUDITED"),
});

/** Body of the finalize request (direct-to-storage upload, step 2). */
export const finalizeStatementSchema = z.object({
  storageKey: z.string().min(1).max(200),
  fileName: z.string().min(1).max(255),
  fiscalYear: statementYearSchema,
  statementType: statementTypeSchema.default("AUDITED"),
});

export type CompanyInfoInput = z.infer<typeof companyInfoSchema>;
export type ContractDetailsInput = z.infer<typeof contractDetailsSchema>;
export type CaseQualitativeInput = z.infer<typeof caseQualitativeSchema>;
