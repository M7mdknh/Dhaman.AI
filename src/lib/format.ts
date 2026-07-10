/**
 * Shared display formatters. Formatting converts Decimal → number for
 * DISPLAY ONLY — money arithmetic stays in Decimal everywhere else.
 */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  value: string | number | { toString(): string },
  currency = "SAR",
): string {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      // Banking convention: negatives in parentheses, e.g. (SAR 8,000,000.00).
      currencySign: "accounting",
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(Number(value.toString()));
}

const wholeMoneyFormatters = new Map<string, Intl.NumberFormat>();

/** Table money: whole currency units ("SAR 6,000,000") — cents are noise in
 * dense queue/list views. Detail views keep the 2-decimal formatMoney. */
export function formatMoneyWhole(
  value: string | number | { toString(): string },
  currency = "SAR",
): string {
  let formatter = wholeMoneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      currencySign: "accounting",
      maximumFractionDigits: 0,
    });
    wholeMoneyFormatters.set(currency, formatter);
  }
  return formatter.format(Number(value.toString()));
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFormatter.format(new Date(value));
}

const compactFormatters = new Map<string, Intl.NumberFormat>();

/** Chart/label money: "SAR 120M". Display only — arithmetic stays Decimal. */
export function formatCompactMoney(value: number, currency = "SAR"): string {
  let formatter = compactFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      notation: "compact",
      maximumFractionDigits: 1,
    });
    compactFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}

/** Ratio display: 2 decimal places, or "—" when incomputable. */
export function formatRatio(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

/** Fraction → percentage display: 0.1167 → "11.7%". */
export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
