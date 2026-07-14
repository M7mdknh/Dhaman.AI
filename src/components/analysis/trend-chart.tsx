"use client";

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

import { formatCompactMoney, formatMoney, formatPercent } from "@/lib/format";

export interface TrendChartPoint {
  fiscalYear: number;
  value: number | null;
}

interface TrendChartProps {
  title: string;
  unit: "money" | "percent";
  currency: string;
  points: TrendChartPoint[];
  /** Latest YoY change (fraction for money, pp for percent); null = n/a. */
  latestChange: number | null;
}

/**
 * Small-multiple bar chart: one metric, 2–3 fiscal years. Single series —
 * no legend (the title names it); every bar direct-labeled. Sign is encoded
 * by position against the zero baseline; the red fill on negatives is a
 * redundant cue, never the only one (palette validated 2026-07-06).
 */
export function TrendChart({ title, unit, currency, points, latestChange }: TrendChartProps) {
  const data = points.map((p) => ({ year: `FY${p.fiscalYear}`, value: p.value }));
  const usable = data.filter((d) => d.value !== null);
  const hasNegative = usable.some((d) => (d.value as number) < 0);

  const label = (value: number) =>
    unit === "money" ? formatCompactMoney(value, currency) : formatPercent(value);
  const tooltipLabel = (value: number) =>
    unit === "money" ? formatMoney(value.toFixed(2), currency) : formatPercent(value);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
        {latestChange !== null && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {latestChange > 0 ? "▲" : latestChange < 0 ? "▼" : "◆"}{" "}
            {unit === "money"
              ? formatPercent(Math.abs(latestChange))
              : `${(Math.abs(latestChange) * 100).toFixed(1)}pp`}{" "}
            YoY
          </span>
        )}
      </div>

      {usable.length === 0 ? (
        <p className="flex h-36 items-center justify-center text-xs text-muted-foreground">
          Not present in the statements
        </p>
      ) : (
        <div className="mt-2 h-36" role="img" aria-label={`${title} by fiscal year`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 18, right: 4, left: 4, bottom: hasNegative ? 14 : 0 }}
            >
              <XAxis
                dataKey="year"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              {hasNegative && <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />}
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                      <span className="text-muted-foreground">{payload[0].payload.year}</span>{" "}
                      <span className="font-medium tabular-nums text-popover-foreground">
                        {tooltipLabel(payload[0].value as number)}
                      </span>
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="value"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                animationDuration={600}
                animationEasing="ease-out"
                // Sign-aware label placement: above positive bars, below the
                // bottom edge of negative bars (never over the axis ticks).
                label={(props) => {
                  const { x, y, width, height, value, index } = props as {
                    x: number; y: number; width: number; height: number;
                    value: number | null; index: number;
                  };
                  if (typeof value !== "number") return <g key={index} />;
                  const below = value < 0;
                  return (
                    <text
                      key={index}
                      x={x + width / 2}
                      y={below ? y + height + 12 : y - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fill="var(--muted-foreground)"
                    >
                      {label(value)}
                    </text>
                  );
                }}
              >
                {data.map((d) => (
                  <Cell
                    key={d.year}
                    fill={d.value !== null && d.value < 0 ? "var(--chart-4)" : "var(--chart-1)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
