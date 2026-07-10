"use client";

import Link from "next/link";
import { useActionState } from "react";

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

import { registerAction } from "../actions";
import { AUTH_FORM_INITIAL } from "../form-state";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, AUTH_FORM_INITIAL);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Contractor registration. Bank staff accounts are provisioned by an
          administrator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
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
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
