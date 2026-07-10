import { AlertTriangle, Eye, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { FlagSeverity, RiskFlag } from "@/lib/finance/types";

const SEVERITY_META: Record<
  FlagSeverity,
  { label: string; icon: typeof ShieldAlert; className: string }
> = {
  HIGH: {
    label: "High",
    icon: ShieldAlert,
    className: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
  },
  MEDIUM: {
    label: "Medium",
    icon: AlertTriangle,
    className: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  },
  LOW: {
    label: "Watch",
    icon: Eye,
    className: "border-border bg-muted text-muted-foreground",
  },
};

function evidenceValue(value: string, currency: string): string {
  // Money evidence is a plain decimal string; ratio/percent evidence already formatted.
  return /^-?\d+(\.\d+)?$/.test(value) ? formatMoneyWhole(value, currency) : value;
}

/** Deterministic rule-based findings with evidence — never AI narrative. */
export function FlagList({ flags, currency }: { flags: RiskFlag[]; currency: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Risk Flags{" "}
          <span className="font-normal text-muted-foreground">({flags.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {flags.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No risk flags detected across the analyzed years.
          </p>
        ) : (
          <ul className="space-y-3">
            {flags.map((flag) => {
              const meta = SEVERITY_META[flag.severity];
              return (
                <li
                  key={`${flag.type}-${flag.affectedYears.join("-")}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("gap-1", meta.className)}>
                      <meta.icon className="size-3" aria-hidden />
                      {meta.label}
                    </Badge>
                    <span className="text-[13px] font-medium text-foreground">
                      {flag.type.replaceAll("_", " ")}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      FY{flag.affectedYears.join(" → FY")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {flag.explanation}
                  </p>
                  {flag.evidence.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {flag.evidence.map((e) => (
                        <span key={`${e.label}-${e.fiscalYear}`}>
                          {e.label} FY{e.fiscalYear}:{" "}
                          <span className="font-medium text-foreground">
                            {evidenceValue(e.value, currency)}
                          </span>
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
