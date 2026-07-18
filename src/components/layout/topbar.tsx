import { CommandPalette } from "@/components/layout/command-palette";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Badge } from "@/components/ui/badge";

import type { SessionPayload } from "@/lib/auth/token";

const ROLE_LABELS: Record<SessionPayload["role"], string> = {
  CONTRACTOR: "Contractor",
  RELATIONSHIP_MANAGER: "Relationship Manager",
  RISK_OFFICER: "Risk Officer",
  ADMIN: "Administrator",
};

/** Bank staff act on behalf of the institution; applicants act for themselves. */
const BANK_NAME = "Alinma Bank";

export function Topbar({ session }: { session: SessionPayload }) {
  const isBankStaff = session.role !== "CONTRACTOR";
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-sm md:px-6">
      {/* Brand shows here on mobile where the sidebar is hidden. */}
      <div className="md:hidden">
        <Logo />
      </div>
      {/* Bank staff get the ⌘K command palette; contractors get the section
          label (their world is a handful of their own cases, reached from the
          dashboard — a search palette would be empty theatre). */}
      {isBankStaff ? (
        <CommandPalette />
      ) : (
        <p className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground md:block">
          Corporate Underwriting
        </p>
      )}

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
        <SignOutButton />
      </div>
    </header>
  );
}
