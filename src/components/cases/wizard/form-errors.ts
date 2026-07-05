import { toast } from "sonner";

import type { FieldError, FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { CaseActionState } from "@/app/(app)/cases/actions";

/** Maps a failed action result onto the form (field errors + toast). */
export function applyActionErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  state: CaseActionState,
): void {
  if (state.fieldErrors) {
    for (const [field, messages] of Object.entries(state.fieldErrors)) {
      if (messages?.length) {
        setError(field as Path<T>, { type: "server", message: messages[0] });
      }
    }
  }
  if (state.error) toast.error(state.error);
}

/** FormField expects `errors?: string[]`; RHF holds a single FieldError. */
export function fieldErrors(error: FieldError | undefined): string[] | undefined {
  return error?.message ? [error.message] : undefined;
}
