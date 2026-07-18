"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";

import { FormField } from "@/components/forms/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { registerAction } from "../actions";
import { AUTH_FORM_INITIAL } from "../form-state";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, AUTH_FORM_INITIAL);

  // Full navigation AFTER the cookie is set (see form-state.ts).
  useEffect(() => {
    if (state.success) window.location.assign("/dashboard");
  }, [state.success]);

  return (
    <div>
      <h1 className="font-display text-4xl font-light tracking-tight text-foreground">
        Create your account
      </h1>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        Contractor registration. Bank staff accounts are provisioned by an
        administrator.
      </p>

      <form action={formAction} className="mt-9 space-y-5" noValidate>
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <FormField
          label="Full name"
          name="fullName"
          autoComplete="name"
          placeholder="Abdulrahman Yaghmour"
          errors={state.fieldErrors.fullName}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          errors={state.fieldErrors.email}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          errors={state.fieldErrors.password}
        />
        <Button type="submit" size="lg" className="w-full" disabled={pending || state.success}>
          {pending || state.success ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
