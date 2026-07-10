import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { StatusBadge } from "@/components/cases/status-badge";
import { PriorityBadge } from "@/components/review/priority-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoneyWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { QueueResult, QueueTab } from "@/services/officer-case-service";

const TABS: { value: QueueTab; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "all", label: "All Cases" },
  { value: "decided", label: "Decided" },
];

function queueHref(tab: QueueTab, query: string, page?: number): string {
  const params = new URLSearchParams();
  if (tab !== "pending") params.set("tab", tab);
  if (query) params.set("q", query);
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

/**
 * The officer review queue. Deliberately server-rendered with plain links
 * and a GET form (a client `router.replace` on searchParams silently fails
 * in production on Next 15.5 — see TECH_DEBT.md).
 */
export function QueueTable({
  result,
  tab,
  query,
}: {
  result: QueueResult;
  tab: QueueTab;
  query: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Queue tabs" className="flex gap-1 rounded-lg bg-muted p-1">
            {TABS.map((t) => (
              <Link
                key={t.value}
                href={queueHref(t.value, query)}
                aria-current={t.value === tab ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                  t.value === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <form action="/dashboard" method="get" className="relative">
            {tab !== "pending" && <input type="hidden" name="tab" value={tab} />}
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search reference, company, contract…"
              aria-label="Search cases"
              className="w-72 pl-8"
            />
          </form>
        </div>

        {result.rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {query ? "No cases match your search." : "No cases in this view."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead className="text-right">Guarantee</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden 2xl:table-cell">Officer</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/review/${row.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {row.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-44 truncate">{row.companyName}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {row.contractTitle ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.guaranteeAmount
                        ? formatMoneyWhole(row.guaranteeAmount, row.currency)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.capacityScore ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.riskScore !== null ? (
                        <span title={row.riskBand ?? undefined}>{row.riskScore}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={row.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="hidden max-w-36 truncate text-muted-foreground 2xl:table-cell">
                      {row.assignedOfficer ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.submittedAt ? formatDate(row.submittedAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {result.pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Page {result.page} of {result.pageCount} · {result.total} case
              {result.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Link
                href={queueHref(tab, query, result.page - 1)}
                aria-disabled={result.page <= 1}
                tabIndex={result.page <= 1 ? -1 : undefined}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  result.page <= 1 && "pointer-events-none opacity-50",
                )}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </Link>
              <Link
                href={queueHref(tab, query, result.page + 1)}
                aria-disabled={result.page >= result.pageCount}
                tabIndex={result.page >= result.pageCount ? -1 : undefined}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  result.page >= result.pageCount && "pointer-events-none opacity-50",
                )}
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
