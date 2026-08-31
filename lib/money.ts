/**
 * RE-Biz stores monetary amounts as HKD numbers for compatibility with the
 * existing receipt and ledger collections.  Calculations, however, always
 * happen in integer cents before being converted back to that representation.
 */
export function amountToCents(value: number) {
  if (!Number.isFinite(value)) throw new Error("INVALID_AMOUNT");
  return Math.round(value * 100);
}

export function centsToAmount(cents: number) {
  return cents / 100;
}

export function calculateLineSubtotal(amount: number, quantity: number, discountAmount: number) {
  const unitCents = amountToCents(amount);
  const discountCents = amountToCents(discountAmount);
  // Quantities are validated to three decimal places.  This makes unit-price
  // multiplication deterministic without relying on binary floating point.
  const quantityMilli = Math.round(quantity * 1000);
  const subtotalCents = Math.round((unitCents * quantityMilli) / 1000) - discountCents;
  if (subtotalCents < 0) throw new Error("NEGATIVE_LINE_TOTAL");
  return centsToAmount(subtotalCents);
}

export function sumAmounts(values: number[]) {
  return centsToAmount(values.reduce((total, value) => total + amountToCents(value), 0));
}
