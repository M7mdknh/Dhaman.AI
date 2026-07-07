"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { recordLogout, registerContractor, verifyCredentials } from "@/services/auth-service";

import type { AuthFormState } from "./form-state";

/** Best-effort source IP for abuse throttling (first hop in X-Forwarded-For). */
async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return h.get("x-real-ip");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const outcome = await verifyCredentials(parsed.data.email, parsed.data.password, await getClientIp());
  if (!outcome.ok) {
    return {
      error:
        outcome.reason === "rate_limited"
          ? "Too many attempts. Please wait a few minutes and try again."
          : // Generic on purpose: do not reveal whether the email exists.
            "Invalid email or password.",
      fieldErrors: {},
    };
  }

  await createSession(outcome.session);
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

  const result = await registerContractor({ ...parsed.data, ip: await getClientIp() });
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
