import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormFieldProps extends React.ComponentProps<typeof Input> {
  label: string;
  name: string;
  errors?: string[];
}

/** Labeled input with accessible error wiring (htmlFor/id + aria-describedby). */
export function FormField({ label, name, errors, ...inputProps }: FormFieldProps) {
  const errorId = `${name}-error`;
  const hasError = Boolean(errors?.length);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        {...inputProps}
      />
      {hasError && (
        <p
          id={errorId}
          className="animate-in fade-in-0 slide-in-from-top-1 text-xs text-destructive duration-200"
        >
          {errors![0]}
        </p>
      )}
    </div>
  );
}
