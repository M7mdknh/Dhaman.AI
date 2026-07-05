"use server";

import { redirect } from "next/navigation";

import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { recordLogout, registerContractor, verifyCredentials } from "@/services/auth-service";

import type { AuthFormState } from "./form-state";

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const session = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!session) {
    // Generic on purpose: do not reveal whether the email exists.
    return { error: "Invalid email or password.", fieldErrors: {} };
  }

  await createSession(session);
  redirect("/dashboard");
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await registerContractor(parsed.data);
  if (!result.ok) {
    return { error: result.error, fieldErrors: {} };
  }

  await createSession(result.session);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) await recordLogout(session.userId);
  await destroySession();
  redirect("/login");
}
