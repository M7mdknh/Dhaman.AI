export interface AuthFormState {
  error: string | null;
  fieldErrors: Record<string, string[]>;
}

export const AUTH_FORM_INITIAL: AuthFormState = { error: null, fieldErrors: {} };
