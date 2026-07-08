"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { FormField } from "@/components/forms/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { loginAction } from "../actions";
import { AUTH_FORM_INITIAL } from "../form-state";

const DEMO_PASSWORD = "Daman!2026";
const DEMO_ACCOUNTS = [
  { label: "Risk Officer", email: "officer@daman.local" },
  { label: "Contractor", email: "contractor@daman.local" },
  { label: "Admin", email: "admin@daman.local" },
];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, AUTH_FORM_INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

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
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access the Daman underwriting platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4" noValidate>
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
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          New contractor?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>

        <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Demo access — one-click sign-in
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fillDemo(account.email)}
              >
                {account.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Fills the form — then press Sign in.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
