"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";

import {
  applyActionErrors,
  fieldErrors,
  focusFirstInvalidField,
} from "@/components/cases/wizard/form-errors";
import { ContractUpload } from "@/components/cases/wizard/contract-upload";
import { FormField } from "@/components/forms/form-field";
import { MoneyField } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AWARD_METHOD_OPTIONS,
  BENEFICIARY_TYPE_OPTIONS,
  BILLING_CYCLE_OPTIONS,
  CONTRACTOR_ROLE_OPTIONS,
  CURRENCY_OPTIONS,
  GUARANTEE_TYPE_FOCUS,
  GUARANTEE_TYPE_OPTIONS,
  PAYMENT_PERIOD_OPTIONS,
  SECTOR_OPTIONS,
  YES_NO_OPTIONS,
} from "@/lib/case-constants";
import { formatMoney } from "@/lib/format";
import {
  compareDecimalStrings,
  contractDetailsSchema,
  type ContractDetailsInput,
} from "@/lib/validation/case";

import type { DefaultValues } from "react-hook-form";
import type { CaseActionState } from "@/app/(app)/cases/actions";
import type { DocumentView } from "@/lib/case-view";

const EMPTY_DEFAULTS: DefaultValues<ContractDetailsInput> = {
  beneficiary: "",
  contractTitle: "",
  contractDescription: "",
  contractValue: "",
  currency: "SAR",
  guaranteePercentage: "",
  projectStartDate: "",
  projectEndDate: "",
  projectLocation: "",
  additionalNotes: "",
  mainContractorName: "",
  backToBackPayment: "",
  priorContractsWithBeneficiary: "",
  advancePaymentPct: "",
  retentionPct: "",
  paymentNotes: "",
  requiredBondPct: "",
  bondValidityDate: "",
  ldRatePctPerWeek: "",
  ldCapPct: "",
  mobilizationWeeks: "",
  keySuppliersNote: "",
  expectedGrossMarginPct: "",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:col-span-2">
      {children}
    </h3>
  );
}

interface ContractStepProps {
  caseId: string | null;
  defaults: ContractDetailsInput | null;
  contractDocument: DocumentView | null;
  onContractDocumentChange: (document: DocumentView | null) => void;
  onBack: () => void;
  onSave: (values: ContractDetailsInput) => Promise<CaseActionState>;
}

/** Fields rendered through a Controller (selects + money inputs) — their DOM
 * ids carry the `contract-` prefix (ids must stay unique across the CSS-hidden
 * steps). Error focusing maps the RHF field name back through here, so a field
 * added below MUST be listed or its error can never be focused. */
const PREFIXED_FIELDS = new Set([
  "beneficiaryType",
  "sector",
  "currency",
  "guaranteeType",
  "contractValue",
  "guaranteePercentage",
  "contractorRole",
  "backToBackPayment",
  "awardMethod",
  "advancePaymentPct",
  "billingCycle",
  "retentionPct",
  "paymentPeriodDays",
  "requiredBondPct",
  "onFirstDemand",
  "extendOrPay",
  "ldRatePctPerWeek",
  "ldCapPct",
  "keySuppliersIdentified",
  "expectedGrossMarginPct",
]);
const contractFieldId = (field: string) =>
  PREFIXED_FIELDS.has(field) ? `contract-${field}` : field;

type SelectName =
  | "beneficiaryType"
  | "sector"
  | "currency"
  | "guaranteeType"
  | "contractorRole"
  | "backToBackPayment"
  | "awardMethod"
  | "billingCycle"
  | "paymentPeriodDays"
  | "onFirstDemand"
  | "extendOrPay"
  | "keySuppliersIdentified";

type PercentName =
  | "guaranteePercentage"
  | "advancePaymentPct"
  | "retentionPct"
  | "requiredBondPct"
  | "ldRatePctPerWeek"
  | "ldCapPct"
  | "expectedGrossMarginPct";

export function ContractStep({
  caseId,
  defaults,
  contractDocument,
  onContractDocumentChange,
  onBack,
  onSave,
}: ContractStepProps) {
  const form = useForm<ContractDetailsInput>({
    resolver: zodResolver(contractDetailsSchema),
    defaultValues: defaults ?? EMPTY_DEFAULTS,
    // We focus errors ourselves: RHF's built-in focus jumps abruptly and
    // cannot reach the ref-less selects at all.
    shouldFocusError: false,
  });
  const { register, control, handleSubmit, setError, formState } = form;
  const guaranteeType = useWatch({ control, name: "guaranteeType" });
  // The money fields are stamped with whatever currency the applicant picked,
  // so the amount is never ambiguous while it is being entered.
  const currency = useWatch({ control, name: "currency" });
  // The guarantee amount is no longer entered directly — it is derived from
  // the ratio. This is a DISPLAY-ONLY preview (see lib/format.ts); the case
  // service recomputes the authoritative Decimal value on save.
  const contractValue = useWatch({ control, name: "contractValue" });
  const guaranteePercentage = useWatch({ control, name: "guaranteePercentage" });
  const contractorRole = useWatch({ control, name: "contractorRole" });
  const keySuppliersIdentified = useWatch({ control, name: "keySuppliersIdentified" });
  const requiredBondPct = useWatch({ control, name: "requiredBondPct" });
  const previewAmount = (() => {
    const value = Number(contractValue);
    const percentage = Number(guaranteePercentage);
    if (!contractValue || !guaranteePercentage || !Number.isFinite(value) || !Number.isFinite(percentage)) {
      return null;
    }
    return formatMoney((value * percentage) / 100, currency || "SAR");
  })();
  // Consistency warning (never blocking): the issued guarantee should match
  // the bond the contract text requires.
  const bondMismatch =
    Boolean(requiredBondPct) &&
    Boolean(guaranteePercentage) &&
    /^\d{1,3}(\.\d{1,2})?$/.test(requiredBondPct ?? "") &&
    /^\d{1,3}(\.\d{1,2})?$/.test(guaranteePercentage ?? "") &&
    compareDecimalStrings(requiredBondPct!, guaranteePercentage!) !== 0;

  const submit = handleSubmit(
    async (values) => {
      const result = await onSave(values);
      if (!result.ok) applyActionErrors(setError, result);
    },
    (errors) => focusFirstInvalidField(errors, contractFieldId),
  );

  /** A currency-stamped amount: grouped on screen, raw decimal in the form. */
  const moneyField = (
    name: "contractValue",
    label: string,
    placeholder: string,
    hint: string,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <MoneyField
          label={label}
          name={`contract-${name}`}
          value={field.value ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          currency={currency || undefined}
          placeholder={placeholder}
          errors={fieldState.error?.message ? [fieldState.error.message] : undefined}
          hint={hint}
        />
      )}
    />
  );

  const percentField = (name: PercentName, label: string, placeholder: string, hint?: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <MoneyField
          label={label}
          name={`contract-${name}`}
          value={field.value ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          suffix="%"
          placeholder={placeholder}
          errors={fieldState.error?.message ? [fieldState.error.message] : undefined}
          hint={hint}
        />
      )}
    />
  );

  const selectField = (
    name: SelectName,
    label: string,
    options: Parameters<typeof SelectField>[0]["options"],
    placeholder: string,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SelectField
          label={label}
          // Prefixed: the company step stays mounted and also has a "sector"
          // field — DOM ids must be unique across the whole wizard.
          name={`contract-${name}`}
          value={field.value ?? ""}
          onChange={field.onChange}
          options={options}
          placeholder={placeholder}
          error={fieldState.error?.message}
        />
      )}
    />
  );

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
          <CardDescription>
            The contract this Letter of Guarantee will secure. The structured terms below feed
            the deterministic contract-risk assessment. Progress is saved as a draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SectionLabel>Beneficiary</SectionLabel>
          <FormField
            label="Beneficiary"
            placeholder="Entity requesting the guarantee"
            {...register("beneficiary")}
            errors={fieldErrors(formState.errors.beneficiary)}
          />
          {selectField(
            "beneficiaryType",
            "Beneficiary Type",
            BENEFICIARY_TYPE_OPTIONS,
            "Government or private",
          )}

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Contract</SectionLabel>
          <div className="sm:col-span-2">
            <FormField
              label="Contract Title"
              {...register("contractTitle")}
              errors={fieldErrors(formState.errors.contractTitle)}
            />
          </div>
          <div className="sm:col-span-2">
            <TextareaField
              label="Contract Description"
              rows={3}
              placeholder="Optional — scope of works, key deliverables"
              {...register("contractDescription")}
              error={formState.errors.contractDescription?.message}
            />
          </div>
          {selectField("sector", "Sector", SECTOR_OPTIONS, "Select the contract sector")}
          <FormField
            label="Project Location"
            placeholder="City / region"
            {...register("projectLocation")}
            errors={fieldErrors(formState.errors.projectLocation)}
          />

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Contractor Role</SectionLabel>
          {selectField(
            "contractorRole",
            "Main Contractor or Subcontractor?",
            CONTRACTOR_ROLE_OPTIONS,
            "Select the role",
          )}
          {selectField(
            "awardMethod",
            "How Was the Contract Won?",
            AWARD_METHOD_OPTIONS,
            "Tender type",
          )}
          {contractorRole === "SUBCONTRACTOR" && (
            <>
              <FormField
                label="Main Contractor"
                placeholder="Who receives the owner's payments"
                {...register("mainContractorName")}
                errors={fieldErrors(formState.errors.mainContractorName)}
              />
              {selectField(
                "backToBackPayment",
                "Payment Terms Back-to-Back?",
                YES_NO_OPTIONS,
                "Paid only when the main contractor is paid?",
              )}
            </>
          )}
          <FormField
            label="Prior Contracts With This Beneficiary"
            inputMode="numeric"
            placeholder="0 if this is the first"
            {...register("priorContractsWithBeneficiary")}
            errors={fieldErrors(formState.errors.priorContractsWithBeneficiary)}
          />

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Guarantee</SectionLabel>
          {moneyField(
            "contractValue",
            "Contract Value",
            "0.00",
            "The full value of the awarded contract, before any guarantee.",
          )}
          {selectField("currency", "Currency", CURRENCY_OPTIONS, "Currency")}
          <div>
            {selectField(
              "guaranteeType",
              "Guarantee Type",
              GUARANTEE_TYPE_OPTIONS,
              "Select a guarantee type",
            )}
            {guaranteeType && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Analysis focus: {GUARANTEE_TYPE_FOCUS[guaranteeType]}
              </p>
            )}
          </div>
          {percentField(
            "guaranteePercentage",
            "Guarantee Ratio",
            "10",
            previewAmount
              ? `Requested guarantee amount: ${previewAmount}`
              : "The guarantee as a share of the contract value — the amount is calculated automatically.",
          )}

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Bond Requirements (per the contract text)</SectionLabel>
          <div>
            {percentField(
              "requiredBondPct",
              "Required Bond %",
              "10",
              "The bond percentage the contract text requires.",
            )}
            {bondMismatch && (
              <p className="mt-1.5 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
                Differs from the guarantee ratio above — the issued bond must match the
                contract exactly. The review will flag this.
              </p>
            )}
          </div>
          <FormField
            label="Required Validity Until"
            type="date"
            {...register("bondValidityDate")}
            errors={fieldErrors(formState.errors.bondValidityDate)}
          />
          {selectField(
            "onFirstDemand",
            "Unconditional / On First Demand?",
            YES_NO_OPTIONS,
            "Per the bond wording",
          )}
          {selectField(
            "extendOrPay",
            "'Extend or Pay' Clause Present?",
            YES_NO_OPTIONS,
            "Per the bond wording",
          )}

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Payment Mechanics</SectionLabel>
          {percentField(
            "advancePaymentPct",
            "Advance Payment",
            "10",
            "Advance the owner pays up front (0–30%).",
          )}
          {selectField(
            "billingCycle",
            "Progress Billing Cycle",
            BILLING_CYCLE_OPTIONS,
            "How often you invoice",
          )}
          {percentField(
            "retentionPct",
            "Retention",
            "5",
            "Withheld from each certificate (0–10%).",
          )}
          {selectField(
            "paymentPeriodDays",
            "Payment Period After Certification",
            PAYMENT_PERIOD_OPTIONS,
            "Days until payment lands",
          )}
          <div className="sm:col-span-2">
            <TextareaField
              label="Payment Notes"
              rows={2}
              placeholder="Optional — anything unusual about the payment arrangement"
              {...register("paymentNotes")}
              error={formState.errors.paymentNotes?.message}
            />
          </div>

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Penalty Clauses</SectionLabel>
          {percentField(
            "ldRatePctPerWeek",
            "Liquidated Damages Rate",
            "0.5",
            "% of contract value per week of delay (0 if none).",
          )}
          {percentField(
            "ldCapPct",
            "Liquidated Damages Cap",
            "10",
            "Maximum total LD exposure (commonly 10%).",
          )}

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Project Execution Plan</SectionLabel>
          <FormField
            label="Expected Mobilization Period (weeks)"
            inputMode="numeric"
            placeholder="e.g. 6"
            {...register("mobilizationWeeks")}
            errors={fieldErrors(formState.errors.mobilizationWeeks)}
          />
          {percentField(
            "expectedGrossMarginPct",
            "Expected Gross Margin",
            "15",
            "Margins under 10% leave no buffer for delays — the engine flags them.",
          )}
          {selectField(
            "keySuppliersIdentified",
            "Key Suppliers / Subcontractors Identified?",
            YES_NO_OPTIONS,
            "Yes or no",
          )}
          {keySuppliersIdentified === "YES" && (
            <FormField
              label="Main Suppliers (optional)"
              placeholder="List the main ones"
              {...register("keySuppliersNote")}
              errors={fieldErrors(formState.errors.keySuppliersNote)}
            />
          )}

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Schedule & Notes</SectionLabel>
          <FormField
            label="Project Start Date"
            type="date"
            {...register("projectStartDate")}
            errors={fieldErrors(formState.errors.projectStartDate)}
          />
          <FormField
            label="Project End Date"
            type="date"
            {...register("projectEndDate")}
            errors={fieldErrors(formState.errors.projectEndDate)}
          />
          <div className="sm:col-span-2">
            <TextareaField
              label="Additional Notes"
              rows={3}
              placeholder="Optional — anything the bank should know"
              {...register("additionalNotes")}
              error={formState.errors.additionalNotes?.message}
            />
          </div>

          {caseId && (
            <>
              <div className="sm:col-span-2"><Separator /></div>
              <SectionLabel>Contract Document</SectionLabel>
              <div className="sm:col-span-2">
                <ContractUpload
                  caseId={caseId}
                  document={contractDocument}
                  onChange={onContractDocumentChange}
                />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save & Continue
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
