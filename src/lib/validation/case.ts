import { z } from "zod";

import { CURRENCY_OPTIONS, SECTOR_OPTIONS, STATEMENT_YEARS } from "@/lib/case-constants";

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
    guaranteeAmount: moneyString("Requested guarantee amount"),
    guaranteeType: z.enum(
      ["BID_BOND", "PERFORMANCE", "ADVANCE_PAYMENT", "RETENTION", "LETTER_OF_CREDIT"],
      "Select a guarantee type",
    ),
    guaranteePercentage: z
      .string()
      .trim()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, "Percentage must be a number with up to 2 decimal places")
      .refine(
        (v) => compareDecimalStrings(v, "100") <= 0 && compareDecimalStrings(v, "0") > 0,
        "Percentage must be between 0 and 100",
      )
      .optional()
      .or(z.literal("")),
    projectStartDate: z.iso.date("Select the project start date"),
    projectEndDate: z.iso.date("Select the project end date"),
    projectLocation: z.string().trim().min(2, "Enter the project location").max(160),
    expectedPaymentTerms: z
      .string()
      .trim()
      .max(500, "Payment terms must be under 500 characters")
      .optional()
      .or(z.literal("")),
    additionalNotes: z
      .string()
      .trim()
      .max(2000, "Notes must be under 2,000 characters")
      .optional()
      .or(z.literal("")),
  })
  .refine((d) => compareDecimalStrings(d.guaranteeAmount, d.contractValue) <= 0, {
    message: "Guarantee amount cannot exceed the contract value",
    path: ["guaranteeAmount"],
  })
  .refine((d) => d.projectEndDate > d.projectStartDate, {
    message: "Project end date must be after the start date",
    path: ["projectEndDate"],
  });

export const statementYearSchema = z.coerce
  .number()
  .int()
  .refine((y) => (STATEMENT_YEARS as readonly number[]).includes(y), {
    message: `Fiscal year must be one of ${STATEMENT_YEARS.join(", ")}`,
  });

/** Body of the presign request (direct-to-storage upload, step 1). Size and
 * type are re-verified server-side against the actual bytes at finalize. */
export const presignStatementSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  fileType: z.string().max(100),
  fiscalYear: statementYearSchema,
});

/** Body of the finalize request (direct-to-storage upload, step 2). */
export const finalizeStatementSchema = z.object({
  storageKey: z.string().min(1).max(200),
  fileName: z.string().min(1).max(255),
  fiscalYear: statementYearSchema,
});

export type CompanyInfoInput = z.infer<typeof companyInfoSchema>;
export type ContractDetailsInput = z.infer<typeof contractDetailsSchema>;
