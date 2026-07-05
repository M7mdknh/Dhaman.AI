import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, FilePen, Plus, SearchCheck, Send } from "lucide-react";

import { CasesPanel } from "@/components/dashboard/cases-panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { toCaseRow } from "@/lib/case-view";
import { cn } from "@/lib/utils";
import { getCaseStats, listCasesForUser } from "@/services/case-service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // The officer workspace ships in a later sprint — bank staff see a notice.
  if (session.role !== "CONTRACTOR") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Welcome, {session.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The Risk Officer workspace is coming in an upcoming release.
          </p>
        </div>
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Submitted underwriting cases will appear here once the review queue ships.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [stats, cases] = await Promise.all([
    getCaseStats(session.userId),
    listCasesForUser(session.userId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Welcome, {session.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your Letter of Guarantee requests and start new underwriting cases.
          </p>
        </div>
        <Link href="/cases/new" className={cn(buttonVariants())}>
          <Plus className="size-4" aria-hidden />
          New Underwriting Case
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Draft Cases" value={stats.draft} icon={FilePen} />
        <StatCard label="Submitted" value={stats.submitted} icon={Send} />
        <StatCard label="Under Review" value={stats.underReview} icon={SearchCheck} />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Underwriting Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <CasesPanel cases={cases.map(toCaseRow)} />
        </CardContent>
      </Card>
    </div>
  );
}
