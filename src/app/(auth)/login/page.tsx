"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { FormField } from "@/components/forms/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { loginAction } from "../actions";
import { AUTH_FORM_INITIAL } from "../form-state";

const DEMO_PASSWORD = "Daman!2026";
const DEMO_ACCOUNTS = [
  { label: "Relationship Manager", email: "rm@daman.local" },
  { label: "Contractor", email: "contractor@daman.local" },
  { label: "Admin", email: "admin@daman.local" },
];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, AUTH_FORM_INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  // Full navigation AFTER the cookie is set — works in every engine (WebKit
  // drops cookies that ride a same-fetch redirect chain; see form-state.ts).
  useEffect(() => {
    if (state.success) window.location.assign("/dashboard");
  }, [state.success]);

  function fillDemo(email: string) {
    const form = formRef.current;
    if (!form) return;
    const emailInput = form.elements.namedItem("email") as HTMLInputElement | null;
    const passwordInput = form.elements.namedItem("password") as HTMLInputElement | null;
    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = DEMO_PASSWORD;
    emailInput?.focus();
  }

  return (
    <div>
      <h1 className="font-display text-4xl font-light tracking-tight text-foreground">
        Sign in
      </h1>
      <p className="mt-2.5 text-sm text-muted-foreground">
        Access the Daman underwriting platform.
      </p>

      <form ref={formRef} action={formAction} className="mt-9 space-y-5" noValidate>
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
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
          autoComplete="current-password"
          errors={state.fieldErrors.password}
        />
        <Button type="submit" size="lg" className="w-full" disabled={pending || state.success}>
          {pending || state.success ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        New contractor?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-12 border-t border-border pt-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Demo environment
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.email}
              type="button"
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => fillDemo(account.email)}
            >
              {account.label}
            </Button>
          ))}
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">
          Fills the form with demo credentials — then press Sign in.
        </p>
      </div>
    </div>
  );
}
