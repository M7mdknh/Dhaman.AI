import { toast } from "sonner";

import type {
  FieldError,
  FieldErrors,
  FieldValues,
  Path,
  UseFormSetError,
} from "react-hook-form";
import type { CaseActionState } from "@/app/(app)/cases/actions";

/**
 * Scrolls to and focuses the first invalid field, in DOM order. react-hook-form
 * can only focus fields it holds a ref for — our Controller-driven selects have
 * none, so a form whose first errors are selects would show messages far
 * off-screen with no scroll at all. `idFor` maps a field name to its DOM id
 * (contract selects are prefixed to keep ids unique across mounted steps).
 */
export function focusFirstInvalidField<T extends FieldValues>(
  errors: FieldErrors<T>,
  idFor: (field: string) => string = (field) => field,
): void {
  const fields = Object.keys(errors)
    .map((field) => document.getElementById(idFor(field)))
    .filter((el): el is HTMLElement => el !== null)
    .sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  const first = fields[0];
  if (!first) return;
  first.scrollIntoView({ behavior: "smooth", block: "center" });
  first.focus({ preventScroll: true });
}

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
