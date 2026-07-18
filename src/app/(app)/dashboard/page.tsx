import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  FileCheck2,
  FilePen,
  Gavel,
  Inbox,
  Plus,
  SearchCheck,
  Send,
  Timer,
} from "lucide-react";

import { CasesPanel } from "@/components/dashboard/cases-panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { WorkflowSync } from "@/components/cases/workflow-sync";
import { QueueTable } from "@/components/review/queue-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { toCaseRow } from "@/lib/case-view";
import { formatDurationShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCaseStats, listCasesForUser } from "@/services/case-service";
import { getWorkbenchSyncToken } from "@/services/workflow-sync-service";
import {
  getProcessingSla,
  getQueueStats,
  listReviewQueue,
  type QueueTab,
} from "@/services/officer-case-service";

import type { Metadata } from "next";
import type { Role } from "@/lib/auth/token";

export const metadata: Metadata = { title: "Dashboard" };

function parseTab(value: string | undefined): QueueTab {
  return value === "all" || value === "decided" ? value : "pending";
}

const BANK_DASHBOARD_TAGLINE: Partial<Record<Role, string>> = {
  ADMIN: "Monitor underwriting operations across the bank.",
  RELATIONSHIP_MANAGER:
    "Review AI-drafted memos, add relationship context, and route packages to the Risk Officer.",
  RISK_OFFICER: "Review submitted underwriting cases and record decisions.",
};

/** The bank-side dashboard: the shared review queue for RMs, officers, and admins. */
async function OfficerDashboard({
  userId,
  fullName,
  role,
  searchParams,
}: {
  userId: string;
  fullName: string;
  role: Role;
  searchParams: { tab?: string; q?: string; page?: string };
}) {
  const tab = parseTab(searchParams.tab);
  const query = searchParams.q?.trim() ?? "";
  const page = Number(searchParams.page) || 1;

  const [stats, queue, sla, syncToken] = await Promise.all([
    getQueueStats(userId),
    listReviewQueue(userId, { tab, query, page }),
    getProcessingSla(userId),
    getWorkbenchSyncToken(userId),
  ]);
  if (!stats || !queue) redirect("/login");

  return (
    <div className="space-y-6">
      {syncToken && <WorkflowSync token={syncToken} />}
      <div>
        <h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">
          Welcome, {fullName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {BANK_DASHBOARD_TAGLINE[role] ?? BANK_DASHBOARD_TAGLINE.RISK_OFFICER}
        </p>
      </div>

      <div className="rise-in-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Pending Review" value={stats.pending} icon={Inbox} />
        <StatCard label="In Review" value={stats.underReview} icon={SearchCheck} />
        <StatCard label="Decided" value={stats.decided} icon={Gavel} />
        <StatCard label="Guarantees Issued" value={stats.issued} icon={FileCheck2} />
        <StatCard
          label="Avg. Time to Assessment"
          value={sla && sla.count > 0 ? formatDurationShort(sla.averageSeconds) : "—"}
          icon={Timer}
          hint={
            sla && sla.count > 0
              ? `across ${sla.count} case${sla.count === 1 ? "" : "s"}`
              : "no completed assessments yet"
          }
        />
      </div>

      <QueueTable result={queue} tab={tab} query={query} />
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role !== "CONTRACTOR") {
    return (
      <OfficerDashboard
        userId={session.userId}
        fullName={session.fullName}
        role={session.role}
        searchParams={await searchParams}
      />
    );
  }

  const [stats, cases, syncToken] = await Promise.all([
    getCaseStats(session.userId),
    listCasesForUser(session.userId),
    getWorkbenchSyncToken(session.userId),
  ]);

  return (
    <div className="space-y-6">
      {syncToken && <WorkflowSync token={syncToken} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">
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

      <div className="rise-in-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Draft Cases" value={stats.draft} icon={FilePen} />
        <StatCard label="Submitted" value={stats.submitted} icon={Send} />
        {/* "In Progress", not "Under Review": the bucket spans every
            in-flight status including PROCESSING_FAILED, which needs the
            CONTRACTOR's retry — calling that "under review" misleads. */}
        <StatCard label="In Progress" value={stats.underReview} icon={SearchCheck} />
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
