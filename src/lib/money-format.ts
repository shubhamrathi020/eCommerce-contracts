import type { Money } from './money.js';

/** Formats minor units as currency, e.g. 129900 paise -> "₹1,299". Whole amounts drop decimals.
 * Lives here (not just in `@ecom/shared/util`) so `apps/api` can build the same human-readable
 * notices the mock does, without pulling in an Angular-oriented shared lib. */
const formatters = new Map<string, Intl.NumberFormat>();

/** Intl formatters are slow to build, so they are built once per locale, currency and decimals. */
function formatter(locale: string, currency: string, whole: boolean): Intl.NumberFormat {
  const key = `${locale}|${currency}|${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
    formatters.set(key, f);
  }
  return f;
}

export function formatMoney(money: Money, locale = 'en-IN'): string {
  return formatter(locale, money.currency, money.amount % 100 === 0).format(money.amount / 100);
}

/**
 * A "was" price may only be shown as a strike-through discount when it is a plausible earlier price (BRD 14, PE-07).
 * A reference price more than four times the selling price (over 75% off) is treated as unverified: no label is shown,
 * and the admin price-health report lists it for review.
 */
export const MAX_CREDIBLE_DISCOUNT_PERCENT = 75;

export function isCredibleReference(price: number, mrp?: number): boolean {
  if (!mrp || mrp <= price) return false;
  return ((mrp - price) / mrp) * 100 <= MAX_CREDIBLE_DISCOUNT_PERCENT;
}

/** Whole-number percentage discount of `price` versus `mrp`; 0 when it is under 1% or the MRP is not a credible earlier price. */
export function discountPercent(price: Money, mrp?: Money): number {
  if (!mrp || mrp.amount <= 0 || price.amount >= mrp.amount || !isCredibleReference(price.amount, mrp.amount)) return 0;
  const pct = Math.round(((mrp.amount - price.amount) / mrp.amount) * 100);
  return pct >= 1 ? pct : 0;
}
