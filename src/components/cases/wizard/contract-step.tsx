"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";

import {
  applyActionErrors,
  fieldErrors,
  focusFirstInvalidField,
} from "@/components/cases/wizard/form-errors";
import { FormField } from "@/components/forms/form-field";
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
  BENEFICIARY_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  GUARANTEE_TYPE_FOCUS,
  GUARANTEE_TYPE_OPTIONS,
  SECTOR_OPTIONS,
} from "@/lib/case-constants";
import { contractDetailsSchema, type ContractDetailsInput } from "@/lib/validation/case";

import type { DefaultValues } from "react-hook-form";
import type { CaseActionState } from "@/app/(app)/cases/actions";

const EMPTY_DEFAULTS: DefaultValues<ContractDetailsInput> = {
  beneficiary: "",
  contractTitle: "",
  contractDescription: "",
  contractValue: "",
  currency: "SAR",
  guaranteeAmount: "",
  guaranteePercentage: "",
  projectStartDate: "",
  projectEndDate: "",
  projectLocation: "",
  expectedPaymentTerms: "",
  additionalNotes: "",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:col-span-2">
      {children}
    </h3>
  );
}

interface ContractStepProps {
  defaults: ContractDetailsInput | null;
  onBack: () => void;
  onSave: (values: ContractDetailsInput) => Promise<CaseActionState>;
}

/** Fields rendered as Controller-driven selects — their DOM ids carry the
 * `contract-` prefix (ids must stay unique across the CSS-hidden steps). */
const SELECT_FIELDS = new Set(["beneficiaryType", "sector", "currency", "guaranteeType"]);
const contractFieldId = (field: string) =>
  SELECT_FIELDS.has(field) ? `contract-${field}` : field;

export function ContractStep({ defaults, onBack, onSave }: ContractStepProps) {
  const form = useForm<ContractDetailsInput>({
    resolver: zodResolver(contractDetailsSchema),
    defaultValues: defaults ?? EMPTY_DEFAULTS,
    // We focus errors ourselves: RHF's built-in focus jumps abruptly and
    // cannot reach the ref-less selects at all.
    shouldFocusError: false,
  });
  const { register, control, handleSubmit, setError, formState } = form;
  const guaranteeType = useWatch({ control, name: "guaranteeType" });

  const submit = handleSubmit(
    async (values) => {
      const result = await onSave(values);
      if (!result.ok) applyActionErrors(setError, result);
    },
    (errors) => focusFirstInvalidField(errors, contractFieldId),
  );

  const selectField = (
    name: "beneficiaryType" | "sector" | "currency" | "guaranteeType",
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
            The contract this Letter of Guarantee will secure. Progress is saved as a draft.
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
          <SectionLabel>Guarantee</SectionLabel>
          <FormField
            label="Contract Value"
            inputMode="decimal"
            placeholder="0.00"
            {...register("contractValue")}
            errors={fieldErrors(formState.errors.contractValue)}
          />
          {selectField("currency", "Currency", CURRENCY_OPTIONS, "Currency")}
          <FormField
            label="Requested Guarantee Amount"
            inputMode="decimal"
            placeholder="0.00"
            {...register("guaranteeAmount")}
            errors={fieldErrors(formState.errors.guaranteeAmount)}
          />
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
          <FormField
            label="Guarantee Percentage (%)"
            inputMode="decimal"
            placeholder="Optional — e.g. 10"
            {...register("guaranteePercentage")}
            errors={fieldErrors(formState.errors.guaranteePercentage)}
          />

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Schedule & Terms</SectionLabel>
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
              label="Expected Payment Terms"
              rows={2}
              placeholder="Optional — e.g. monthly progress payments, 10% retention"
              {...register("expectedPaymentTerms")}
              error={formState.errors.expectedPaymentTerms?.message}
            />
          </div>
          <div className="sm:col-span-2">
            <TextareaField
              label="Additional Notes"
              rows={3}
              placeholder="Optional — anything the bank should know"
              {...register("additionalNotes")}
              error={formState.errors.additionalNotes?.message}
            />
          </div>
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
