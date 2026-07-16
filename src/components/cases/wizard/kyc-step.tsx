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
  AUDITOR_TIER_OPTIONS,
  CONTRACTOR_CLASSIFICATION_OPTIONS,
  EQUIPMENT_PLAN_OPTIONS,
  FUNDING_SOURCE_OPTIONS,
  NITAQAT_OPTIONS,
  PROJECTS_COMPLETED_OPTIONS,
  SAUDI_BANK_OPTIONS,
  YES_NO_OPTIONS,
} from "@/lib/case-constants";
import { caseQualitativeSchema, type CaseQualitativeInput } from "@/lib/validation/case";

import type { DefaultValues } from "react-hook-form";
import type { CaseActionState } from "@/app/(app)/cases/actions";

const EMPTY_DEFAULTS: DefaultValues<CaseQualitativeInput> = {
  crIssueDate: "",
  crActivities: "",
  contractorClassification: "",
  groupName: "",
  gmName: "",
  gmExperienceYears: "",
  ownershipChangeNote: "",
  litigationNote: "",
  largestProjectValue: "",
  projectIssuesNote: "",
  guaranteeCalledNote: "",
  sameTypeExperienceNote: "",
  runningProjectsCount: "",
  backlogValue: "",
  outstandingGuarantees: "",
  conductIncidentsNote: "",
  auditorName: "",
};

/** Fields rendered through a Controller (selects + money inputs). Their DOM
 * ids carry the `kyc-` prefix so ids stay unique across the CSS-hidden
 * steps; error focusing maps field names back through here. */
const PREFIXED_FIELDS = new Set([
  "contractorClassification",
  "partOfGroup",
  "ownershipChanged",
  "nitaqatBand",
  "ongoingLitigation",
  "projectsCompletedBand",
  "largestProjectValue",
  "hadProjectIssues",
  "guaranteeCalled",
  "sameTypeExperience",
  "backlogValue",
  "outstandingGuarantees",
  "equipmentPlan",
  "heavyHiringNeeded",
  "mainBank",
  "conductIncidents",
  "auditorTier",
  "fundingSource",
]);
const kycFieldId = (field: string) => (PREFIXED_FIELDS.has(field) ? `kyc-${field}` : field);

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:col-span-2">
      {children}
    </h3>
  );
}

interface KycStepProps {
  defaults: CaseQualitativeInput | null;
  onBack: () => void;
  onSave: (values: CaseQualitativeInput) => Promise<CaseActionState>;
}

/**
 * Wizard Step 2 — the KYC questionnaire behind the qualitative pillar of the
 * underwriting grade. Answered fresh on every case (never pre-filled): each
 * decision keeps the exact answers it was made under. Every banded answer
 * maps to a deterministic score; "if yes, describe" fields appear only when
 * triggered so the default path stays short.
 */
export function KycStep({ defaults, onBack, onSave }: KycStepProps) {
  const form = useForm<CaseQualitativeInput>({
    resolver: zodResolver(caseQualitativeSchema),
    defaultValues: defaults ?? EMPTY_DEFAULTS,
    // We focus errors ourselves: RHF's built-in focus jumps abruptly and
    // cannot reach the ref-less selects at all.
    shouldFocusError: false,
  });
  const { register, control, handleSubmit, setError, formState } = form;

  const partOfGroup = useWatch({ control, name: "partOfGroup" });
  const ownershipChanged = useWatch({ control, name: "ownershipChanged" });
  const ongoingLitigation = useWatch({ control, name: "ongoingLitigation" });
  const hadProjectIssues = useWatch({ control, name: "hadProjectIssues" });
  const guaranteeCalled = useWatch({ control, name: "guaranteeCalled" });
  const sameTypeExperience = useWatch({ control, name: "sameTypeExperience" });
  const conductIncidents = useWatch({ control, name: "conductIncidents" });
  const auditorTier = useWatch({ control, name: "auditorTier" });

  const submit = handleSubmit(
    async (values) => {
      const result = await onSave(values);
      if (!result.ok) applyActionErrors(setError, result);
    },
    (errors) => focusFirstInvalidField(errors, kycFieldId),
  );

  const selectField = (
    name: keyof CaseQualitativeInput & string,
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
          name={`kyc-${name}`}
          value={(field.value as string) ?? ""}
          onChange={field.onChange}
          options={options}
          placeholder={placeholder}
          error={fieldState.error?.message}
        />
      )}
    />
  );

  const moneyField = (
    name: "largestProjectValue" | "backlogValue" | "outstandingGuarantees",
    label: string,
    hint: string,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <MoneyField
          label={label}
          name={`kyc-${name}`}
          value={field.value ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          currency="SAR"
          placeholder="0.00"
          errors={fieldState.error?.message ? [fieldState.error.message] : undefined}
          hint={hint}
        />
      )}
    />
  );

  const noteField = (
    name: keyof CaseQualitativeInput & string,
    label: string,
    placeholder: string,
  ) => (
    <div className="sm:col-span-2">
      <TextareaField
        label={label}
        rows={2}
        placeholder={placeholder}
        {...register(name)}
        error={(formState.errors[name] as { message?: string } | undefined)?.message}
      />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Company Profile & Track Record</CardTitle>
          <CardDescription>
            These answers feed the qualitative side of the underwriting assessment — every
            question maps to a scored signal. Answer for the company as it stands today;
            progress is saved as a draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SectionLabel>Company Profile</SectionLabel>
          <FormField
            label="CR Issuance Date"
            type="date"
            {...register("crIssueDate")}
            errors={fieldErrors(formState.errors.crIssueDate)}
          />
          {selectField(
            "contractorClassification",
            "Contractor Classification",
            CONTRACTOR_CLASSIFICATION_OPTIONS,
            "If classified",
          )}
          <div className="sm:col-span-2">
            <TextareaField
              label="Registered CR Activities"
              rows={2}
              placeholder="Activities as printed on the Commercial Registration"
              {...register("crActivities")}
              error={formState.errors.crActivities?.message}
            />
          </div>
          <FormField
            label="General Manager"
            placeholder="Full name"
            {...register("gmName")}
            errors={fieldErrors(formState.errors.gmName)}
          />
          <FormField
            label="GM Experience in This Field (years)"
            inputMode="numeric"
            placeholder="e.g. 12"
            {...register("gmExperienceYears")}
            errors={fieldErrors(formState.errors.gmExperienceYears)}
          />
          {selectField("partOfGroup", "Part of a Group?", YES_NO_OPTIONS, "Yes or no")}
          {partOfGroup === "YES" && (
            <FormField
              label="Group Name"
              {...register("groupName")}
              errors={fieldErrors(formState.errors.groupName)}
            />
          )}
          {selectField(
            "ownershipChanged",
            "Ownership / Management Change in Last 2 Years?",
            YES_NO_OPTIONS,
            "Yes or no",
          )}
          {ownershipChanged === "YES" &&
            noteField("ownershipChangeNote", "Describe the Change", "What changed, and when")}
          {selectField("nitaqatBand", "Nitaqat Band", NITAQAT_OPTIONS, "Select the band")}
          {selectField(
            "ongoingLitigation",
            "Ongoing Litigation or Labor Issues?",
            YES_NO_OPTIONS,
            "Yes or no",
          )}
          {ongoingLitigation === "YES" &&
            noteField("litigationNote", "Describe the Litigation / Labor Issue", "Parties, subject, and status")}

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Track Record & Experience</SectionLabel>
          {selectField(
            "projectsCompletedBand",
            "Projects Completed to Date",
            PROJECTS_COMPLETED_OPTIONS,
            "Select the range",
          )}
          {moneyField(
            "largestProjectValue",
            "Largest Single Completed Project",
            "The engine compares this against the new contract's value.",
          )}
          {selectField(
            "hadProjectIssues",
            "Any Project Terminated, Withdrawn, or Heavily Delayed?",
            YES_NO_OPTIONS,
            "Yes or no",
          )}
          {hadProjectIssues === "YES" &&
            noteField("projectIssuesNote", "Describe What Happened", "Project, cause, and outcome")}
          {selectField(
            "guaranteeCalled",
            "Has a Guarantee Ever Been Called?",
            YES_NO_OPTIONS,
            "Yes or no",
          )}
          {guaranteeCalled === "YES" &&
            noteField("guaranteeCalledNote", "Describe the Guarantee Call", "Beneficiary, amount, and circumstances")}
          {selectField(
            "sameTypeExperience",
            "Experience With This Specific Type of Work?",
            YES_NO_OPTIONS,
            "Yes or no",
          )}
          {sameTypeExperience === "YES" &&
            noteField("sameTypeExperienceNote", "Examples (optional)", "Similar projects delivered")}

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Current Workload & Capacity</SectionLabel>
          <FormField
            label="Projects Currently Running"
            inputMode="numeric"
            placeholder="e.g. 4"
            {...register("runningProjectsCount")}
            errors={fieldErrors(formState.errors.runningProjectsCount)}
          />
          {moneyField(
            "backlogValue",
            "Combined Remaining Value of Running Projects",
            "The unbilled backlog across every running project.",
          )}
          {moneyField(
            "outstandingGuarantees",
            "Outstanding Guarantees With All Banks",
            "Total live guarantee exposure across every bank, including this one.",
          )}
          {selectField(
            "equipmentPlan",
            "Equipment for This Project",
            EQUIPMENT_PLAN_OPTIONS,
            "Owned, rented, or purchased",
          )}
          {selectField(
            "heavyHiringNeeded",
            "Significant Hiring Needed for This Project?",
            YES_NO_OPTIONS,
            "Yes or no",
          )}

          <div className="sm:col-span-2"><Separator /></div>
          <SectionLabel>Financial Conduct</SectionLabel>
          {selectField(
            "mainBank",
            "Main Operating Bank",
            SAUDI_BANK_OPTIONS,
            "Where cash actually flows",
          )}
          {selectField(
            "conductIncidents",
            "Bounced Cheques, Past Dues, or Restructured Facilities?",
            YES_NO_OPTIONS,
            "Yes or no",
          )}
          {conductIncidents === "YES" &&
            noteField("conductIncidentsNote", "Describe the Incident(s)", "What happened, when, and how it was resolved")}
          {selectField(
            "auditorTier",
            "Who Audits the Financial Statements?",
            AUDITOR_TIER_OPTIONS,
            "Select the auditor tier",
          )}
          {auditorTier && auditorTier !== "UNAUDITED" && (
            <FormField
              label="Audit Firm Name"
              {...register("auditorName")}
              errors={fieldErrors(formState.errors.auditorName)}
            />
          )}
          {selectField(
            "fundingSource",
            "How Is the Project Funded Until First Payment?",
            FUNDING_SOURCE_OPTIONS,
            "Select the funding source",
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
