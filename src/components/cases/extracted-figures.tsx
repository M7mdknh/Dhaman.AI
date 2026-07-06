import { AlertTriangle } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EXTRACTED_FIGURE_LABELS, type StatementFiguresView } from "@/lib/case-view";
import { formatMoney } from "@/lib/format";

/**
 * Deterministic extraction review: canonical figures per fiscal year exactly
 * as parsed from the uploaded statements. "—" = not present in the document.
 */
export function ExtractedFigures({
  statements,
  warnings,
}: {
  statements: StatementFiguresView[];
  warnings: string[];
}) {
  if (statements.length === 0) return null;
  const years = statements.map((s) => s.fiscalYear);

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-44">Figure ({statements[0].currency})</TableHead>
              {years.map((year) => (
                <TableHead key={year} className="text-right tabular-nums">
                  FY{year}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {EXTRACTED_FIGURE_LABELS.map(([key, label]) => {
              // Hide rows no year has a value for — keeps the table honest and short.
              if (statements.every((s) => s.figures[key] === null)) return null;
              return (
                <TableRow key={key}>
                  <TableCell className="text-muted-foreground">{label}</TableCell>
                  {statements.map((s) => (
                    <TableCell key={s.fiscalYear} className="text-right tabular-nums">
                      {s.figures[key] !== null ? formatMoney(s.figures[key]!, s.currency) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Figures extracted deterministically from the uploaded audited statements —
        no AI involved. Missing values were not present in the documents.
      </p>
    </div>
  );
}
