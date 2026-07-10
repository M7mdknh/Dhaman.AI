import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { SessionPayload } from "@/lib/auth/token";

const ROLE_LABELS: Record<SessionPayload["role"], string> = {
  CONTRACTOR: "Contractor",
  RISK_OFFICER: "Risk Officer",
  ADMIN: "Administrator",
};

/** Bank staff act on behalf of the institution; applicants act for themselves. */
const BANK_NAME = "Alinma Bank";

export function Topbar({ session }: { session: SessionPayload }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-sm md:px-6">
      {/* Brand shows here on mobile where the sidebar is hidden. */}
      <div className="md:hidden">
        <Logo />
      </div>
      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-[13px] font-medium leading-tight text-foreground">
            {session.fullName}
          </p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {session.role === "CONTRACTOR" ? session.email : BANK_NAME}
          </p>
        </div>
        <Badge variant="secondary">{ROLE_LABELS[session.role]}</Badge>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
