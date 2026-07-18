"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { StatusBadge } from "@/components/cases/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDate, formatMoneyWhole } from "@/lib/format";

import type { CaseRowView } from "@/lib/case-view";

/** Whole-row-clickable contractor case row (see review/queue-row for the why). */
export function CasesRow({ item }: { item: CaseRowView }) {
  const router = useRouter();
  const href = `/cases/${item.id}`;

  return (
    <TableRow onClick={() => router.push(href)} className="group cursor-pointer">
      <TableCell>
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          {item.reference}
          <ArrowUpRight
            className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </Link>
      </TableCell>
      <TableCell className="max-w-56 truncate">
        {item.contractTitle ?? <span className="text-muted-foreground">Untitled draft</span>}
      </TableCell>
      <TableCell className="hidden max-w-44 truncate md:table-cell">
        {item.beneficiary ?? "—"}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">
        {item.guaranteeAmount ? formatMoneyWhole(item.guaranteeAmount, item.currency) : "—"}
      </TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
        {formatDate(item.updatedAt)}
      </TableCell>
    </TableRow>
  );
}
