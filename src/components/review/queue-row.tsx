"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { StatusBadge } from "@/components/cases/status-badge";
import { PriorityBadge } from "@/components/review/priority-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDate, formatMoneyWhole } from "@/lib/format";

import type { QueueRow as QueueRowData } from "@/services/officer-case-service";

/**
 * A review-queue row where the WHOLE row is the click target (officers scan
 * fast and click anywhere). The reference stays a real <Link> so keyboard
 * focus, middle-click, and "open in new tab" all keep working; a row-level
 * push handles clicks on the rest. router.push to a distinct path is safe here
 * — the searchParams-replace caveat (see queue-table.tsx) does not apply.
 */
export function QueueRow({ row }: { row: QueueRowData }) {
  const router = useRouter();
  const href = `/review/${row.id}`;

  return (
    <TableRow
      onClick={() => router.push(href)}
      className="group cursor-pointer"
    >
      <TableCell>
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          {row.reference}
          <ArrowUpRight
            className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </Link>
      </TableCell>
      <TableCell className="max-w-44 truncate">{row.companyName}</TableCell>
      <TableCell className="max-w-56 truncate text-muted-foreground">
        {row.contractTitle ?? "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.guaranteeAmount ? formatMoneyWhole(row.guaranteeAmount, row.currency) : "—"}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums 2xl:table-cell">
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
  );
}
