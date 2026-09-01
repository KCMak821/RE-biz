/**
 * Single source of formatting for every screen. Amounts, dates and counts were
 * previously formatted by three separate copies of the same helper, which is
 * how the same number ended up looking different on two pages.
 */

const amountFormat = new Intl.NumberFormat("en-HK", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

/** `1234.5` → `1,234.50`. Anything unparseable becomes `0.00`. */
export function money(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? "");
  return amountFormat.format(Number.isFinite(amount) ? amount : 0);
}

/** `HKD 1,234.50` — always pair the number with its currency. */
export function currencyAmount(currency: string, value: number | string | null | undefined) {
  return `${currency} ${money(value)}`;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Whole days from `from` to `date`; negative means the date has passed.
 * The reference date is passed in rather than read from the clock so callers can
 * hold it in a module constant and keep render pure.
 */
export function daysUntil(date: string, from: string) {
  const target = new Date(`${date}T00:00:00`).getTime();
  const start = new Date(`${from}T00:00:00`).getTime();
  if (!Number.isFinite(target) || !Number.isFinite(start)) return Number.NaN;
  return Math.round((target - start) / 86_400_000);
}

const dateFormat = new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeStyle: "short" });

export function formatDate(value: string | undefined | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

export function formatDateTime(value: string | undefined | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormat.format(date);
}

export function fallback(value: string | undefined | null) {
  return value?.trim() ? value : "—";
}

/** Joins the parts of a contact line, dropping the blanks. */
export function joinParts(parts: Array<string | undefined | null>, separator = " · ") {
  return parts.filter((part) => part?.trim()).join(separator);
}
