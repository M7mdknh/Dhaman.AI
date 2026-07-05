"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { CasesTable } from "@/components/dashboard/cases-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { CaseRowView } from "@/lib/case-view";

const STATUS_FILTERS = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "DECLINED", label: "Declined" },
];

/**
 * Search + status filter + table. Filtering is instant and in-memory —
 * the MVP case book per company is small; revisit if pagination arrives.
 */
export function CasesPanel({ cases }: { cases: CaseRowView[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases.filter((item) => {
      if (status !== "ALL" && item.status !== status) return false;
      if (!needle) return true;
      return [item.reference, item.contractTitle, item.beneficiary].some((field) =>
        field?.toLowerCase().includes(needle),
      );
    });
  }, [cases, query, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reference, title, beneficiary…"
            className="pl-8"
            aria-label="Search cases"
          />
        </div>
        <Select
          items={STATUS_FILTERS}
          value={status}
          onValueChange={(value) => setStatus((value as string) ?? "ALL")}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <CasesTable cases={visible} filtered={Boolean(query.trim()) || status !== "ALL"} />
    </div>
  );
}
