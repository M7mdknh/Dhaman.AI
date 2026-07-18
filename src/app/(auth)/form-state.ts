export interface AuthFormState {
  error: string | null;
  fieldErrors: Record<string, string[]>;
  /** Set by the action once the session cookie is written; the client then
   * performs a FULL navigation. A server-side redirect() here is unreliable:
   * WebKit does not attach a cookie set on a 303 when following it within
   * the same fetch, so the follow-up bounces back to /login. */
  success?: boolean;
}

export const AUTH_FORM_INITIAL: AuthFormState = { error: null, fieldErrors: {} };
