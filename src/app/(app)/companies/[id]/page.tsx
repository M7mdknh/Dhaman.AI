/**
 * Bank-side company page — the company as the parent entity its contracts
 * hang off. Everything here is DERIVED from the company's submitted cases
 * (see company-history-service): all contracts, guarantees, decision
 * outcomes, and the bank's own aggregate exposure. Bank staff only.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";

import { StatusBadge } from "@/components/cases/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSession } from "@/lib/auth/session";
import { guaranteeTypeLabel } from "@/lib/case-constants";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCompanyHistory } from "@/services/company-history-service";

import type { Metadata } from "next";
import type { CaseStatus, GuaranteeType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Company History" };

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function CompanyHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "CONTRACTOR") notFound();

  const { id } = await params;
  const history = await getCompanyHistory(session.userId, id);
  if (!history) notFound();

  const { company, cases, totals } = history;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/review"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-2")}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to review queue
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Building2 className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {company.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              CR {company.crNumber} · {company.sector} · {company.city}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Cases with the bank"
          value={String(totals.totalCases)}
          hint={`${totals.approved} approved · ${totals.declined} declined · ${totals.inFlight} in flight`}
        />
        <StatTile
          label="Active guarantees"
          value={String(totals.activeGuarantees)}
          hint="Issued and unexpired"
        />
        <StatTile
          label="Active exposure"
          value={formatMoney(totals.activeGuaranteeExposure, "SAR")}
          hint="Sum of live guarantee amounts"
        />
        <StatTile
          label="Pending exposure"
          value={formatMoney(totals.pendingGuaranteeExposure, "SAR")}
          hint="Requested on undecided cases"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Contracts & Guarantees</CardTitle>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No submitted cases yet — this company&apos;s history starts with its first
              submission.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Beneficiary</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Guarantee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/review/${c.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">
                        {c.contractTitle ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-44 truncate">{c.beneficiary ?? "—"}</TableCell>
                      <TableCell>
                        {c.guaranteeType
                          ? guaranteeTypeLabel(c.guaranteeType as GuaranteeType)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.guaranteeAmount ? formatMoney(c.guaranteeAmount, c.currency) : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status as CaseStatus} />
                      </TableCell>
                      <TableCell>
                        {c.guaranteeReference ? (
                          <span className="text-xs">
                            <Badge variant="outline" className="font-medium">
                              {c.guaranteeReference}
                            </Badge>
                            {c.guaranteeExpiryDate && (
                              <span className="ml-1.5 text-muted-foreground">
                                exp. {formatDate(c.guaranteeExpiryDate)}
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {c.submittedAt ? formatDate(c.submittedAt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
