import { AlertTriangle, ClipboardCheck, FileWarning, Info, ShieldAlert } from "lucide-react";

import { ConfidenceBadge } from "@/components/analysis/confidence-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SEVERITY_LABEL } from "@/lib/finance/confidence";
import { BADGE_TONE, SURFACE_TONE, TEXT_TONE } from "@/lib/finance/display";
import { cn } from "@/lib/utils";

import type { ValidationReportView } from "@/lib/finance/confidence";
import type { IntegrityFinding } from "@/services/finance/financial-integrity-validator";

const SEVERITY_ICON: Record<IntegrityFinding["severity"], typeof AlertTriangle> = {
  BLOCKING: ShieldAlert,
  WARNING: AlertTriangle,
  INFO: Info,
};

/** The anchor "Review Validation Report" links to. */
export const VALIDATION_REPORT_ID = "validation-report";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-[13px] leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

/**
 * The Validation Report: why this assessment is (or is not) trustworthy,
 * written for a credit committee. Reads like a memo section — Summary,
 * Confidence, Affected Statements, Issues Found, Recommended Action — because
 * that is how the reader will have to justify their decision later.
 *
 * Display only: every line comes from findings the Financial Integrity
 * Validator already produced.
 */
export function ValidationReport({ report }: { report: ValidationReportView }) {
  const blocking = report.issues.filter((i) => i.severity === "BLOCKING").length;
  const warnings = report.issues.filter((i) => i.severity === "WARNING").length;

  return (
    <Card id={VALIDATION_REPORT_ID} className="scroll-mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />
            Validation Report
          </CardTitle>
          <ConfidenceBadge confidence={report.confidence} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className={cn("rounded-lg border p-4", SURFACE_TONE[report.confidence.tone])}>
          <Field label="Summary">
            <p>{report.summary}</p>
          </Field>
        </div>

        <Field label="Confidence">
          <p>{report.confidence.summary}</p>
        </Field>

        <Separator />

        <div className="grid gap-5 @lg:grid-cols-2">
          <Field label="Financial statements affected">
            {report.affectedYears.length === 0 ? (
              <p className="text-muted-foreground">None.</p>
            ) : (
              <ul className="space-y-1">
                {report.affectedYears.map((year) => {
                  const excluded = report.excludedYears.includes(year);
                  return (
                    <li key={year} className="flex items-center gap-2">
                      <FileWarning
                        className={cn("size-3.5 shrink-0", excluded ? TEXT_TONE.red : TEXT_TONE.amber)}
                        aria-hidden
                      />
                      <span>Audited financial statements — FY{year}</span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-px text-[11px] font-medium",
                          excluded ? BADGE_TONE.red : BADGE_TONE.amber,
                        )}
                      >
                        {excluded ? "Excluded" : "Reviewed"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Field>

          <Field label="Assessment based on">
            {report.assessedYears.length === 0 ? (
              <p className={TEXT_TONE.red}>
                No financial year — the assessment could not be completed.
              </p>
            ) : (
              <p>
                {report.assessedYears.map((y) => `FY${y}`).join(", ")}
                {report.excludedYears.length > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    (every figure, ratio and score on this page reflects{" "}
                    {report.assessedYears.length === 1 ? "this year" : "these years"} only)
                  </span>
                )}
              </p>
            )}
          </Field>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Issues found{" "}
            <span className="font-normal normal-case tracking-normal">
              ({blocking > 0 && `${blocking} blocking`}
              {blocking > 0 && warnings > 0 && ", "}
              {warnings > 0 && `${warnings} warning${warnings === 1 ? "" : "s"}`}
              {blocking === 0 && warnings === 0 && "context only"})
            </span>
          </p>
          <ul className="mt-2.5 space-y-2.5">
            {report.issues.map((issue, i) => {
              const Icon = SEVERITY_ICON[issue.severity];
              return (
                <li
                  key={`${issue.title}-${issue.fiscalYear}-${i}`}
                  className="flex items-start gap-2.5 rounded-lg border border-border p-3"
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", TEXT_TONE[issue.tone])} aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-foreground">{issue.title}</p>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-px text-[11px] font-medium",
                          BADGE_TONE[issue.tone],
                        )}
                      >
                        {SEVERITY_LABEL[issue.severity]}
                      </span>
                      {issue.fiscalYear !== null && (
                        <span className="text-[11px] text-muted-foreground">FY{issue.fiscalYear}</span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{issue.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <Separator />

        <Field label="Recommended action">
          <p>{report.recommendedAction}</p>
        </Field>
      </CardContent>
    </Card>
  );
}

/**
 * Shown where the verdict would have been when nothing passed validation.
 * The recommendation is not merely hidden — it was never produced, and saying
 * so plainly is the honest thing: an officer must not read a missing verdict
 * as a neutral one.
 */
export function AssessmentUnavailable() {
  return (
    <section
      aria-label="Underwriting verdict"
      className={cn("rounded-2xl border p-6 sm:p-8", SURFACE_TONE.red)}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Can the bank issue this guarantee?
      </p>
      <div className="mt-3 flex items-center gap-3">
        <ShieldAlert className={cn("size-8 shrink-0 sm:size-9", TEXT_TONE.red)} aria-hidden />
        <h1
          className={cn(
            "text-3xl font-semibold leading-none tracking-tight sm:text-4xl",
            TEXT_TONE.red,
          )}
        >
          Assessment could not be completed
        </h1>
      </div>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        The uploaded financial statements did not pass integrity validation, so
        no underwriting recommendation has been produced. The Validation Report
        below sets out what could not be confirmed and what to do next.
      </p>
    </section>
  );
}
