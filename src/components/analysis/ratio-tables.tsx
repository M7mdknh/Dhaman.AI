"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoneyWhole, formatPercent, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { RatioEvidence, RatioEvidenceByYear } from "@/lib/finance/ratio-evidence";
import type { GrowthKey, GrowthPeriod, RatioKey, YearRatios } from "@/lib/finance/types";

type Display = "ratio" | "percent";

interface RatioRow {
  key: RatioKey;
  label: string;
  display: Display;
}

/** Category → rows, exactly the sprint's ratio list; formulas in docs/FINANCIAL_ENGINE.md. */
const CATEGORIES: { title: string; rows: RatioRow[] }[] = [
  {
    title: "Liquidity",
    rows: [
      { key: "currentRatio", label: "Current Ratio", display: "ratio" },
      { key: "quickRatio", label: "Quick Ratio", display: "ratio" },
      { key: "cashRatio", label: "Cash Ratio", display: "ratio" },
    ],
  },
  {
    title: "Leverage",
    rows: [
      { key: "debtRatio", label: "Debt Ratio", display: "ratio" },
      { key: "debtToEquity", label: "Debt to Equity", display: "ratio" },
      { key: "debtToAssets", label: "Debt to Assets", display: "ratio" },
      { key: "interestCoverage", label: "Interest Coverage", display: "ratio" },
    ],
  },
  {
    title: "Profitability",
    rows: [
      { key: "grossMargin", label: "Gross Margin", display: "percent" },
      { key: "operatingMargin", label: "Operating Margin", display: "percent" },
      { key: "netMargin", label: "Net Profit Margin", display: "percent" },
      { key: "returnOnAssets", label: "Return on Assets", display: "percent" },
      { key: "returnOnEquity", label: "Return on Equity", display: "percent" },
      { key: "ebitdaMargin", label: "EBITDA Margin", display: "percent" },
    ],
  },
  {
    title: "Efficiency",
    rows: [
      { key: "assetTurnover", label: "Asset Turnover", display: "ratio" },
      { key: "inventoryTurnover", label: "Inventory Turnover", display: "ratio" },
      { key: "receivableTurnover", label: "Receivable Turnover", display: "ratio" },
    ],
  },
  {
    title: "Cash Flow & Coverage",
    rows: [
      { key: "operatingCashFlowRatio", label: "Operating Cash Flow Ratio", display: "ratio" },
      { key: "dscr", label: "Debt Service Coverage (DSCR)", display: "ratio" },
      { key: "ebitdaCoverage", label: "EBITDA Coverage", display: "ratio" },
    ],
  },
];

const GROWTH_LABELS: Record<GrowthKey, string> = {
  revenueGrowth: "Revenue Growth",
  assetGrowth: "Asset Growth",
  equityGrowth: "Equity Growth",
  cashGrowth: "Cash Growth",
  netIncomeGrowth: "Net Income Growth",
};

function format(display: Display, value: number | null): string {
  return display === "percent" ? formatPercent(value) : formatRatio(value);
}

const ORDER_OF_LIQUIDITY_NOTE =
  "Not disclosed — this balance sheet is presented in order of liquidity, without a current/non-current split.";
const ORDER_OF_LIQUIDITY_CASH_FLOW_NOTE =
  "Operating Cash Flow Ratio is not disclosed — it needs current liabilities, and this balance sheet is " +
  "presented in order of liquidity, without a current/non-current split. DSCR and EBITDA Coverage are unaffected.";

/** The popover body: formula + the exact statement lines behind the number. */
function EvidenceBody({
  label,
  fiscalYear,
  display,
  value,
  currency,
  evidence,
}: {
  label: string;
  fiscalYear: number;
  display: Display;
  value: number | null;
  currency: string;
  evidence: RatioEvidence;
}) {
  const part = (p: RatioEvidence["numerator"]) =>
    p.value === null ? "—" : formatMoneyWhole(p.value, currency);
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">FY{fiscalYear}</p>
      </div>
      <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
        {evidence.formula}
      </p>
      <dl className="space-y-1">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-xs text-muted-foreground">{evidence.numerator.label}</dt>
          <dd className="text-xs font-medium tabular-nums text-foreground">
            {part(evidence.numerator)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-xs text-muted-foreground">{evidence.denominator.label}</dt>
          <dd className="text-xs font-medium tabular-nums text-foreground">
            {part(evidence.denominator)}
          </dd>
        </div>
      </dl>
      <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">Result</span>
        <span className="font-display text-lg font-light tabular-nums text-foreground">
          {format(display, value)}
        </span>
      </div>
      {evidence.note && <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">{evidence.note}</p>}
    </div>
  );
}

/** A single ratio value: interactive (opens its evidence) when computable. */
function RatioCell({
  label,
  fiscalYear,
  display,
  value,
  currency,
  evidence,
}: {
  label: string;
  fiscalYear: number;
  display: Display;
  value: number | null;
  currency: string;
  evidence?: RatioEvidence;
}) {
  const text = format(display, value);
  if (!evidence || value === null) {
    return <TableCell className="text-right tabular-nums">{text}</TableCell>;
  }
  return (
    <TableCell className="p-0 text-right tabular-nums">
      <Popover>
        <PopoverTrigger
          className={cn(
            "w-full cursor-pointer px-3 py-2 text-right tabular-nums underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 transition-colors",
            "hover:bg-accent hover:text-foreground data-popup-open:bg-accent",
          )}
          aria-label={`${label} FY${fiscalYear}: ${text} — show the figures behind it`}
        >
          {text}
        </PopoverTrigger>
        <PopoverContent align="end">
          <EvidenceBody
            label={label}
            fiscalYear={fiscalYear}
            display={display}
            value={value}
            currency={currency}
            evidence={evidence}
          />
        </PopoverContent>
      </Popover>
    </TableCell>
  );
}

/** Per-category ratio tables, one column per fiscal year (ascending). */
export function RatioTables({
  ratiosByYear,
  currency,
  orderOfLiquidity = false,
  evidence,
}: {
  ratiosByYear: YearRatios[];
  currency: string;
  /** True when the balance sheet publishes no current/non-current split. */
  orderOfLiquidity?: boolean;
  /** Per-year numerator/denominator behind each ratio — makes cells clickable. */
  evidence?: RatioEvidenceByYear;
}) {
  const years = ratiosByYear.map((y) => y.fiscalYear);

  return (
    <div className="grid gap-6 @2xl:grid-cols-2">
      {CATEGORIES.map((category) => (
        <Card key={category.title}>
          <CardHeader>
            <CardTitle className="text-sm">{category.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ratio</TableHead>
                  {years.map((year) => (
                    <TableHead key={year} className="text-right tabular-nums">
                      FY{year}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {category.rows.map((row) => (
                  <TableRow key={row.key}>
                    {/* Labels may wrap — the year columns must never be pushed out of view. */}
                    <TableCell className="whitespace-normal text-muted-foreground">{row.label}</TableCell>
                    {ratiosByYear.map((y) => (
                      <RatioCell
                        key={y.fiscalYear}
                        label={row.label}
                        fiscalYear={y.fiscalYear}
                        display={row.display}
                        value={y.ratios[row.key]}
                        currency={currency}
                        evidence={evidence?.[y.fiscalYear]?.[row.key]}
                      />
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {orderOfLiquidity && category.title === "Liquidity" && (
              <p className="mt-2 text-xs text-muted-foreground">{ORDER_OF_LIQUIDITY_NOTE}</p>
            )}
            {orderOfLiquidity && category.title === "Cash Flow & Coverage" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {ORDER_OF_LIQUIDITY_CASH_FLOW_NOTE}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Working Capital & Free Cash Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                {years.map((year) => (
                  <TableHead key={year} className="text-right tabular-nums">
                    FY{year}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="whitespace-normal text-muted-foreground">Working Capital</TableCell>
                {ratiosByYear.map((y) => (
                  <TableCell key={y.fiscalYear} className="text-right tabular-nums">
                    {y.workingCapital === null ? "—" : formatMoneyWhole(y.workingCapital, currency)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="whitespace-normal text-muted-foreground">Free Cash Flow</TableCell>
                {ratiosByYear.map((y) => (
                  <TableCell key={y.fiscalYear} className="text-right tabular-nums">
                    {y.freeCashFlow === null ? "—" : formatMoneyWhole(y.freeCashFlow, currency)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          {orderOfLiquidity && (
            <p className="mt-2 text-xs text-muted-foreground">{ORDER_OF_LIQUIDITY_NOTE}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** YoY growth per adjacent period. Null = prior year non-positive or missing. */
export function GrowthTable({ periods }: { periods: GrowthPeriod[] }) {
  if (periods.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Growth (Year over Year)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              {periods.map((p) => (
                <TableHead key={p.toYear} className="text-right tabular-nums">
                  FY{p.fromYear} → FY{p.toYear}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(Object.keys(GROWTH_LABELS) as GrowthKey[]).map((key) => (
              <TableRow key={key}>
                <TableCell className="whitespace-normal text-muted-foreground">{GROWTH_LABELS[key]}</TableCell>
                {periods.map((p) => (
                  <TableCell key={p.toYear} className="text-right tabular-nums">
                    {formatPercent(p.growth[key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">
          “—” = growth against a non-positive or missing prior-year base is not meaningful.
        </p>
      </CardContent>
    </Card>
  );
}
