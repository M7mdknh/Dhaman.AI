import { LayoutDashboard } from "lucide-react";

import { getSession } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Welcome, {session?.fullName?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Daman prepares decision-ready underwriting packages for Letters of
          Guarantee.
        </p>
      </div>

      {/* Placeholder — statistics cards and recent cases arrive in Sprint 2. */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <LayoutDashboard className="size-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            Your dashboard is being prepared
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Statistics and recent underwriting cases will appear here in the
            next release.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
