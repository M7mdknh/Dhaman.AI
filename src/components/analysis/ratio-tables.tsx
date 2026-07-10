import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoneyWhole, formatPercent, formatRatio } from "@/lib/format";

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

/** Per-category ratio tables, one column per fiscal year (ascending). */
export function RatioTables({
  ratiosByYear,
  currency,
}: {
  ratiosByYear: YearRatios[];
  currency: string;
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
                    <TableCell className="text-muted-foreground">{row.label}</TableCell>
                    {ratiosByYear.map((y) => (
                      <TableCell key={y.fiscalYear} className="text-right tabular-nums">
                        {format(row.display, y.ratios[row.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                <TableCell className="text-muted-foreground">Working Capital</TableCell>
                {ratiosByYear.map((y) => (
                  <TableCell key={y.fiscalYear} className="text-right tabular-nums">
                    {y.workingCapital === null ? "—" : formatMoneyWhole(y.workingCapital, currency)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Free Cash Flow</TableCell>
                {ratiosByYear.map((y) => (
                  <TableCell key={y.fiscalYear} className="text-right tabular-nums">
                    {y.freeCashFlow === null ? "—" : formatMoneyWhole(y.freeCashFlow, currency)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
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
                <TableCell className="text-muted-foreground">{GROWTH_LABELS[key]}</TableCell>
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
