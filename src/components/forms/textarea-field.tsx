import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TextareaFieldProps extends React.ComponentProps<typeof Textarea> {
  label: string;
  name: string;
  error?: string;
}

/** Labeled textarea with accessible error wiring, mirroring FormField. */
export function TextareaField({ label, name, error, ...textareaProps }: TextareaFieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...textareaProps}
      />
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
