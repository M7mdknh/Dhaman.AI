"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import {
  applyActionErrors,
  fieldErrors,
  focusFirstInvalidField,
} from "@/components/cases/wizard/form-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SECTOR_OPTIONS } from "@/lib/case-constants";
import { companyInfoSchema, type CompanyInfoInput } from "@/lib/validation/case";

import type { CaseActionState } from "@/app/(app)/cases/actions";

interface CompanyStepProps {
  defaults: CompanyInfoInput;
  isNew: boolean;
  onSave: (values: CompanyInfoInput) => Promise<CaseActionState>;
}

export function CompanyStep({ defaults, isNew, onSave }: CompanyStepProps) {
  const form = useForm<CompanyInfoInput>({
    resolver: zodResolver(companyInfoSchema),
    defaultValues: defaults,
    // We focus errors ourselves: RHF's built-in focus jumps abruptly and
    // cannot reach the ref-less sector select at all.
    shouldFocusError: false,
  });
  const { register, control, handleSubmit, setError, formState } = form;

  const submit = handleSubmit(
    async (values) => {
      const result = await onSave(values);
      if (!result.ok) applyActionErrors(setError, result);
    },
    (errors) => focusFirstInvalidField(errors),
  );

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>
            {isNew
              ? "Tell us about your company. This becomes your company profile for all future cases."
              : "Pre-filled from your company profile — changes here update the profile."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField
              label="Company Name"
              {...register("name")}
              errors={fieldErrors(formState.errors.name)}
              autoComplete="organization"
            />
          </div>
          <FormField
            label="Commercial Registration"
            placeholder="10-digit CR number"
            inputMode="numeric"
            {...register("crNumber")}
            errors={fieldErrors(formState.errors.crNumber)}
          />
          <Controller
            control={control}
            name="sector"
            render={({ field, fieldState }) => (
              <SelectField
                label="Sector"
                name="sector"
                value={field.value ?? ""}
                onChange={field.onChange}
                options={SECTOR_OPTIONS}
                placeholder="Select a sector"
                error={fieldState.error?.message}
              />
            )}
          />
          <FormField
            label="City"
            {...register("city")}
            errors={fieldErrors(formState.errors.city)}
          />
          <FormField
            label="Contact Person"
            {...register("contactPerson")}
            errors={fieldErrors(formState.errors.contactPerson)}
            autoComplete="name"
          />
          <FormField
            label="Email"
            type="email"
            {...register("contactEmail")}
            errors={fieldErrors(formState.errors.contactEmail)}
            autoComplete="email"
          />
          <FormField
            label="Phone Number"
            type="tel"
            placeholder="+966 5X XXX XXXX"
            {...register("phone")}
            errors={fieldErrors(formState.errors.phone)}
            autoComplete="tel"
          />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save & Continue
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
