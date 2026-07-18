import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";

import { CasesRow } from "@/components/dashboard/cases-row";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { CaseRowView } from "@/lib/case-view";

interface CasesTableProps {
  cases: CaseRowView[];
  /** True when the empty result is due to search/filter, not an empty book. */
  filtered: boolean;
}

/** Presentational table; filtering happens in the surrounding CasesPanel. */
export function CasesTable({ cases, filtered }: CasesTableProps) {
  if (cases.length === 0 && !filtered) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <FolderOpen className="size-5" aria-hidden />
        </span>
        <h3 className="mt-4 text-sm font-semibold text-foreground">No underwriting cases yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Create your first case to request a Letter of Guarantee. It takes a few minutes.
        </p>
        <Link href="/cases/new" className={cn(buttonVariants(), "mt-4")}>
          <Plus className="size-4" aria-hidden />
          New Underwriting Case
        </Link>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Contract</TableHead>
          <TableHead className="hidden md:table-cell">Beneficiary</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Guarantee</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
              No cases match your search.
            </TableCell>
          </TableRow>
        ) : (
          cases.map((item) => <CasesRow key={item.id} item={item} />)
        )}
      </TableBody>
    </Table>
  );
}
