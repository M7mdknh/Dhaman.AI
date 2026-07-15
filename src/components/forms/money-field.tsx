"use client";

import { useLayoutEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  caretAfterSignificant,
  countSignificant,
  groupDigits,
  sanitizeMoneyInput,
} from "@/lib/money-input";
import { cn } from "@/lib/utils";

interface MoneyFieldProps {
  label: string;
  name: string;
  /** The RAW decimal string the form holds — never separated. */
  value: string;
  /** Receives the RAW decimal string. Validation is unaffected. */
  onChange: (raw: string) => void;
  onBlur?: () => void;
  /** Currency code shown inside the field, e.g. "SAR". */
  currency?: string;
  /** Unit shown after the number, e.g. "%". */
  suffix?: string;
  placeholder?: string;
  errors?: string[];
  /** One line under the field explaining what the bank does with the number. */
  hint?: string;
}

/**
 * A money/percentage input that reads like a banking terminal: the number is
 * grouped as it is typed ("6,000,000") and stamped with its currency, while
 * the form still holds the plain decimal string ("6000000").
 *
 * The caret is the whole difficulty. Inserting separators shifts every
 * character to its right, so restoring the raw offset would drop the cursor a
 * comma away from where the user was typing — and re-setting it on every
 * render bounces it to the end. Instead the caret is measured in significant
 * characters (digits and the point), which regrouping cannot move, and
 * restored once, synchronously, before the browser paints.
 */
export function MoneyField({
  label,
  name,
  value,
  onChange,
  onBlur,
  currency,
  suffix,
  placeholder,
  errors,
  hint,
}: MoneyFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = Boolean(errors?.length);
  const display = groupDigits(value);

  // Restore the caret only after a keystroke we regrouped — never on a render
  // the user did not cause (which is what makes cursors jump to the end).
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const el = event.target;
    const typedCaret = el.selectionStart ?? el.value.length;
    // Anchor on how many digits precede the caret — commas are noise here.
    const significantBefore = countSignificant(el.value.slice(0, typedCaret));
    const raw = sanitizeMoneyInput(el.value);
    pendingCaret.current = caretAfterSignificant(groupDigits(raw), significantBefore);
    onChange(raw);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        {currency && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
          >
            {currency}
          </span>
        )}
        <Input
          ref={ref}
          id={name}
          name={name}
          value={display}
          onChange={handleChange}
          onBlur={onBlur}
          placeholder={placeholder}
          // Numeric keypad on mobile; the field never accepts letters anyway.
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={hasError || undefined}
          aria-describedby={
            [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined
          }
          className={cn(
            // Figures line up column-to-column when they are tabular.
            "text-right tabular-nums",
            currency && "pl-11",
            suffix && "pr-7",
          )}
        />
        {suffix && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
          >
            {suffix}
          </span>
        )}
      </div>
      {hasError ? (
        <p
          id={errorId}
          className="animate-in fade-in-0 slide-in-from-top-1 text-xs text-destructive duration-200"
        >
          {errors![0]}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
