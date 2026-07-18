"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

/**
 * Signs out via the server action, then performs a FULL navigation. The
 * cookie deletion must not ride a same-fetch redirect chain (WebKit ignores
 * cookie changes on followed redirects) — same rule as sign-in.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Sign out"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await logoutAction();
        } finally {
          window.location.assign("/login");
        }
      }}
    >
      <LogOut className="size-4" aria-hidden />
      <span className="hidden sm:inline">{pending ? "Signing out…" : "Sign out"}</span>
    </Button>
  );
}
