"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Option } from "@/lib/case-constants";

interface SelectFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (Option | string)[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

/** Labeled select with accessible error wiring, mirroring FormField. */
export function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  placeholder = "Select…",
  error,
  disabled,
}: SelectFieldProps) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const errorId = `${name}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Select
        items={items}
        value={value || null}
        onValueChange={(v) => onChange((v as string) ?? "")}
        disabled={disabled}
      >
        <SelectTrigger
          id={name}
          className="w-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p
          id={errorId}
          className="animate-in fade-in-0 slide-in-from-top-1 text-xs text-destructive duration-200"
        >
          {error}
        </p>
      )}
    </div>
  );
}
