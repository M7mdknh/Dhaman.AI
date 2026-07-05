"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface WizardStep {
  id: number;
  label: string;
}

interface StepperProps {
  steps: WizardStep[];
  current: number;
  completedSteps: number[];
  canOpen: (id: number) => boolean;
  onSelect: (id: number) => void;
}

/** Persistent wizard stepper. Visited/completed steps stay clickable. */
export function Stepper({ steps, current, completedSteps, canOpen, onSelect }: StepperProps) {
  return (
    <nav aria-label="Wizard progress">
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const isCurrent = step.id === current;
          const isComplete = completedSteps.includes(step.id) && !isCurrent;
          const clickable = canOpen(step.id) && !isCurrent;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
              {index > 0 && <span className="h-px w-4 shrink-0 bg-border sm:w-6" aria-hidden />}
              <button
                type="button"
                onClick={() => clickable && onSelect(step.id)}
                disabled={!canOpen(step.id)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  clickable && "hover:bg-muted",
                  !canOpen(step.id) && "cursor-not-allowed opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    isComplete && "border-primary/40 bg-primary/10 text-primary",
                    !isCurrent && !isComplete && "border-border text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {isComplete ? <Check className="size-3.5" strokeWidth={3} /> : step.id}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-sm font-medium md:block",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground md:hidden">
        Step {current} of {steps.length}: {steps.find((s) => s.id === current)?.label}
      </p>
    </nav>
  );
}
