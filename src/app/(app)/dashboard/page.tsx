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
} from "lucide-react";

import { CasesPanel } from "@/components/dashboard/cases-panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { QueueTable } from "@/components/review/queue-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { toCaseRow } from "@/lib/case-view";
import { cn } from "@/lib/utils";
import { getCaseStats, listCasesForUser } from "@/services/case-service";
import {
  getQueueStats,
  listReviewQueue,
  type QueueTab,
} from "@/services/officer-case-service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

function parseTab(value: string | undefined): QueueTab {
  return value === "all" || value === "decided" ? value : "pending";
}

/** The bank-side dashboard: the officer's review queue; admins monitor it. */
async function OfficerDashboard({
  userId,
  fullName,
  isAdmin,
  searchParams,
}: {
  userId: string;
  fullName: string;
  isAdmin: boolean;
  searchParams: { tab?: string; q?: string; page?: string };
}) {
  const tab = parseTab(searchParams.tab);
  const query = searchParams.q?.trim() ?? "";
  const page = Number(searchParams.page) || 1;

  const [stats, queue] = await Promise.all([
    getQueueStats(userId),
    listReviewQueue(userId, { tab, query, page }),
  ]);
  if (!stats || !queue) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Welcome, {fullName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? "Monitor underwriting operations across the bank."
            : "Review submitted underwriting cases and record decisions."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pending Review" value={stats.pending} icon={Inbox} />
        <StatCard label="In Review" value={stats.underReview} icon={SearchCheck} />
        <StatCard label="Decided" value={stats.decided} icon={Gavel} />
        <StatCard label="Guarantees Issued" value={stats.issued} icon={FileCheck2} />
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
        isAdmin={session.role === "ADMIN"}
        searchParams={await searchParams}
      />
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
