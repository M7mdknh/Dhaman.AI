/**
 * Null-safe Decimal arithmetic for the engines. Every helper returns null
 * instead of throwing or producing NaN/Infinity — a missing figure or zero
 * denominator degrades the single metric, never the report.
 */
import { Prisma } from "@/generated/prisma/client";

import { RATIO_PRECISION } from "@/lib/finance/thresholds";

export const Decimal = Prisma.Decimal;
export type DecimalValue = Prisma.Decimal;

type In = DecimalValue | null | undefined;

/** a / b as a rounded number; null when either side is missing or b = 0. */
export function ratio(a: In, b: In): number | null {
  if (a == null || b == null || b.isZero()) return null;
  const value = a.div(b).toDecimalPlaces(RATIO_PRECISION).toNumber();
  return Number.isFinite(value) ? value : null;
}

export function add(a: In, b: In): DecimalValue | null {
  if (a == null || b == null) return null;
  return a.add(b);
}

export function sub(a: In, b: In): DecimalValue | null {
  if (a == null || b == null) return null;
  return a.sub(b);
}

/** Sum of the non-null values; null when ALL are missing. */
export function sumPresent(...values: In[]): DecimalValue | null {
  const present = values.filter((v): v is DecimalValue => v != null);
  if (present.length === 0) return null;
  return present.reduce((acc, v) => acc.add(v), new Decimal(0));
}

/**
 * YoY growth (current − prior) / |prior| as a fraction.
 * Null when either value is missing or prior ≤ 0 (a growth percentage
 * against a non-positive base is not meaningful).
 */
export function growth(current: In, prior: In): number | null {
  if (current == null || prior == null || prior.lte(0)) return null;
  const value = current.sub(prior).div(prior.abs()).toDecimalPlaces(RATIO_PRECISION).toNumber();
  return Number.isFinite(value) ? value : null;
}

/**
 * Signed change fraction that stays meaningful for negative bases:
 * (current − prior) / |prior|. Null when missing or prior = 0.
 * Used by trend/flag engines where direction matters more than "growth".
 */
export function changeFraction(current: In, prior: In): number | null {
  if (current == null || prior == null || prior.isZero()) return null;
  const value = current.sub(prior).div(prior.abs()).toDecimalPlaces(RATIO_PRECISION).toNumber();
  return Number.isFinite(value) ? value : null;
}

/** Linear clamp of value onto [0, 1] between floor (→0) and ceil (→1). */
export function clampScore(value: number, floor: number, ceil: number): number {
  const t = (value - floor) / (ceil - floor);
  return Math.max(0, Math.min(1, t));
}

export function toMoneyString(value: In): string | null {
  return value == null ? null : value.toFixed(2);
}
