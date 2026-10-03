import type { AppliedCoupon, Cart, CartLine, ShippingMethodId } from './cart.js';
import type { Money } from './money.js';
import { formatMoney } from './money-format.js';
import type { Product } from './catalog.js';
import { type Promotion, type PromotionContext, type RuleTrace, type WalletInput, evaluatePromotions, spendFrom } from './promotions.js';

/**
 * Pure cart-pricing rules shared by the mock cart (`@ecom/shared/data-access`) and the real commerce API
 * (`apps/api`), so "how a cart is priced" is defined exactly once — the same pattern as `catalog-derive.ts`.
 * Nothing here is a source of truth for *state* (what's in the cart); it only turns state into money.
 */

/** Persisted shape: the facts a cart needs, before pricing. A real backend stores the same facts server-side. */
export interface StoredCart {
  items: { variantId: string; quantity: number; /** Price (paise) the shopper last saw. */ seenPrice: number }[];
  couponCode?: string;
  shippingMethod: ShippingMethodId;
  /** Gift card on the cart (BRD 14); its balance is looked up by whoever prices the cart. */
  giftCardCode?: string;
  /** Spend store credit on this cart. */
  useCredit?: boolean;
}

export const EMPTY_STORED_CART: StoredCart = { items: [], shippingMethod: 'standard' };

export const MAX_LINE_QUANTITY = 10;
export const FREE_SHIPPING_THRESHOLD = 49_900;
export const STANDARD_SHIPPING = 4_900;
export const EXPRESS_SHIPPING = 9_900;
export const COD_MAX_TOTAL = 500_000;

const inr = (amount: number): Money => ({ amount: Math.round(amount), currency: 'INR' });

export interface Coupon {
  code: string;
  description: string;
  kind: 'percent' | 'flat' | 'free_shipping';
  value: number;
  /** Paise. */
  minSubtotal: number;
  /** Paise cap for percent coupons. */
  maxDiscount?: number;
  expiresAt?: string;
}

export const COUPONS: Coupon[] = [
  { code: 'WELCOME10', description: '10% off up to ₹500', kind: 'percent', value: 10, minSubtotal: 99_900, maxDiscount: 50_000 },
  { code: 'FLAT100', description: '₹100 off', kind: 'flat', value: 10_000, minSubtotal: 69_900 },
  { code: 'FREESHIP', description: 'Free shipping', kind: 'free_shipping', value: 0, minSubtotal: 0 },
  { code: 'EXPIRED50', description: '50% off', kind: 'percent', value: 50, minSubtotal: 0, expiresAt: '2025-12-31T23:59:59Z' },
];

/** GST rates by top-level category id; prices already include GST. */
const GST_BY_ROOT: Record<string, number> = { 'cat-grocery': 0.05, 'cat-books': 0, 'cat-fashion': 0.12 };
const DEFAULT_GST = 0.18;

export const gstRateFor = (product: Product): number => GST_BY_ROOT[product.categoryPath[0].id] ?? DEFAULT_GST;

export type CouponResult = { ok: true; coupon: Coupon; discount: number } | { ok: false; message: string };

export function evaluateCoupon(code: string, subtotal: number, now: number): CouponResult {
  const coupon = COUPONS.find((c) => c.code === code.trim().toUpperCase());
  if (!coupon) return { ok: false, message: 'This coupon code is not valid.' };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) return { ok: false, message: 'This coupon has expired.' };
  if (subtotal < coupon.minSubtotal) return { ok: false, message: `Add ${formatMoney(inr(coupon.minSubtotal - subtotal))} more to use this coupon.` };
  let discount = 0;
  if (coupon.kind === 'percent') discount = Math.min(Math.floor((subtotal * coupon.value) / 100), coupon.maxDiscount ?? Number.MAX_SAFE_INTEGER);
  if (coupon.kind === 'flat') discount = Math.min(coupon.value, subtotal);
  return { ok: true, coupon, discount };
}

export function shippingFee(method: ShippingMethodId, amountAfterDiscount: number, freeShippingCoupon: boolean): number {
  if (amountAfterDiscount <= 0 || freeShippingCoupon) return 0;
  if (method === 'express') return EXPRESS_SHIPPING;
  return amountAfterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
}

/** Optional inputs for BRD 14. Without them a cart is priced exactly as before. */
export interface PricingExtras {
  promotions?: Promotion[];
  context?: Partial<Pick<PromotionContext, 'priorOrders' | 'flashRemaining'>>;
  wallet?: WalletInput & { giftCard?: { code: string; balance: number; problem?: string } };
}

export interface PricedCart {
  cart: Cart;
  /** Which offers fired or didn't, and why (used by the admin simulator). */
  trace: RuleTrace[];
  /** Stored cart after clamping quantities, dropping unknown items and removing an invalid coupon. */
  stored: StoredCart;
}

/** Recomputes a full cart from the catalog. Pure: all money logic lives here, never in the client. */
export function priceCart(stored: StoredCart, products: Product[], now: number, extras: PricingExtras = {}): PricedCart {
  const notices: string[] = [];
  const lines: CartLine[] = [];
  const keptItems: StoredCart['items'] = [];
  const categoriesOf = new Map<string, string[]>();

  for (const item of stored.items) {
    const product = products.find((p) => p.variants.some((v) => v.id === item.variantId));
    const variant = product?.variants.find((v) => v.id === item.variantId);
    if (!product || !variant) {
      notices.push('An item in your cart is no longer available and was removed.');
      continue;
    }
    const max = variant.backorder ? MAX_LINE_QUANTITY : Math.min(MAX_LINE_QUANTITY, variant.stock);
    let quantity = Math.min(item.quantity, Math.max(max, 1));
    let issue: CartLine['issue'];
    let previousUnitPrice: Money | undefined;

    if (variant.stock === 0 && !variant.backorder) {
      issue = 'out_of_stock';
      quantity = item.quantity;
      notices.push(`${product.title} is out of stock. Remove it to continue.`);
    } else if (quantity < item.quantity) {
      issue = 'quantity_reduced';
      notices.push(`Only ${variant.stock} of ${product.title} available. Quantity updated.`);
    }
    if (issue !== 'out_of_stock' && item.seenPrice !== variant.price.amount) {
      issue ??= 'price_changed';
      previousUnitPrice = inr(item.seenPrice);
      notices.push(`Price of ${product.title} updated from ${formatMoney(inr(item.seenPrice))} to ${formatMoney(variant.price)}.`);
    }

    const lineTotal = variant.price.amount * quantity;
    const rate = gstRateFor(product);
    const line: CartLine = {
      productId: product.id,
      variantId: variant.id,
      slug: product.slug,
      title: product.title,
      brandName: product.brandName,
      image: variant.images?.[0] ?? product.images[0],
      options: variant.options,
      unitPrice: variant.price,
      quantity,
      maxQuantity: max,
      lineTotal: inr(lineTotal),
      taxIncluded: inr(lineTotal - lineTotal / (1 + rate)),
    };
    if (variant.mrp && variant.mrp.amount > variant.price.amount) line.mrp = variant.mrp;
    if (variant.backorder && quantity > variant.stock) line.backorder = { ...variant.backorder };
    if (issue) line.issue = issue;
    if (previousUnitPrice) line.previousUnitPrice = previousUnitPrice;
    lines.push(line);
    categoriesOf.set(variant.id, [product.categoryId, ...product.categoryPath.map((c) => c.id)]);
    keptItems.push({ ...item, quantity });
  }

  const purchasable = lines.filter((l) => l.issue !== 'out_of_stock');
  const subtotal = purchasable.reduce((sum, l) => sum + l.lineTotal.amount, 0);
  const mrpSavings = purchasable.reduce((sum, l) => sum + (l.mrp ? (l.mrp.amount - l.unitPrice.amount) * l.quantity : 0), 0);
  const tax = purchasable.reduce((sum, l) => sum + l.taxIncluded.amount, 0);

  // Automatic offers first (BRD 14), then the coupon on what is left, then shipping.
  const promo = extras.promotions?.length
    ? evaluatePromotions(
        purchasable.map((l) => ({ variantId: l.variantId, productId: l.productId, categoryIds: categoriesOf.get(l.variantId) ?? [], unitPrice: l.unitPrice.amount, quantity: l.quantity })),
        extras.promotions,
        { now, priorOrders: extras.context?.priorOrders ?? 0, flashRemaining: extras.context?.flashRemaining ?? {} },
        (after) => {
          const r = stored.couponCode ? evaluateCoupon(stored.couponCode, after, now) : undefined;
          return r?.ok ? r.discount : 0;
        },
      )
    : undefined;
  const promotionDiscount = promo?.discount ?? 0;
  const afterOffers = subtotal - promotionDiscount;

  let couponCode = stored.couponCode;
  let coupon: AppliedCoupon | undefined;
  let discount = 0;
  if (couponCode) {
    const result = evaluateCoupon(couponCode, afterOffers, now);
    if (promo && !promo.couponAllowed) {
      const blocker = promo.applied[0]?.name ?? 'an offer';
      notices.push(`Coupon ${couponCode} was not applied: "${blocker}" saves you more and cannot be combined with a coupon.`);
    } else if (result.ok) {
      discount = result.discount;
      coupon = { code: result.coupon.code, description: result.coupon.description, discount: inr(discount), freeShipping: result.coupon.kind === 'free_shipping' };
    } else {
      notices.push(`Coupon ${couponCode} was removed. ${result.message}`);
      couponCode = undefined;
    }
  }

  const afterDiscount = afterOffers - discount;
  const shipping = shippingFee(stored.shippingMethod, afterDiscount, coupon?.freeShipping ?? false);
  const due = afterDiscount + shipping;

  // Gift card, then store credit: neither can take the total below zero (PE-05).
  let giftCardCode = stored.giftCardCode;
  let giftCardApplied = 0;
  const card = extras.wallet?.giftCard;
  if (giftCardCode) {
    if (!card || card.code !== giftCardCode) {
      notices.push(`Gift card ${giftCardCode} was removed because it could not be found.`);
      giftCardCode = undefined;
    } else if (card.problem) {
      notices.push(`Gift card ${giftCardCode} was removed. ${card.problem}`);
      giftCardCode = undefined;
    } else {
      giftCardApplied = spendFrom(card.balance, due).spent;
    }
  }
  const creditApplied = stored.useCredit ? spendFrom(extras.wallet?.credit ?? 0, due - giftCardApplied).spent : 0;
  const total = due - giftCardApplied - creditApplied;
  const toFree = stored.shippingMethod === 'standard' && !coupon?.freeShipping && afterDiscount > 0 && afterDiscount < FREE_SHIPPING_THRESHOLD ? FREE_SHIPPING_THRESHOLD - afterDiscount : 0;

  const cart: Cart = {
    lines,
    shippingMethod: stored.shippingMethod,
    totals: {
      itemCount: purchasable.reduce((n, l) => n + l.quantity, 0),
      subtotal: inr(subtotal),
      mrpSavings: inr(mrpSavings),
      couponDiscount: inr(discount),
      ...(promotionDiscount > 0 ? { promotionDiscount: inr(promotionDiscount) } : {}),
      ...(giftCardApplied > 0 ? { giftCardApplied: inr(giftCardApplied) } : {}),
      ...(creditApplied > 0 ? { creditApplied: inr(creditApplied) } : {}),
      shipping: inr(shipping),
      taxIncluded: inr(subtotal > 0 ? (tax * afterDiscount) / subtotal : 0),
      total: inr(total),
      ...(toFree > 0 ? { amountToFreeShipping: inr(toFree) } : {}),
    },
    notices: [...new Set(notices)],
    blocked: lines.some((l) => l.issue === 'out_of_stock'),
  };
  if (coupon) cart.coupon = coupon;
  if (promo && promo.applied.length > 0) cart.promotions = promo.applied;
  if (giftCardCode) cart.giftCardCode = giftCardCode;
  if (stored.useCredit) cart.useCredit = true;

  return {
    cart,
    trace: promo?.trace ?? [],
    stored: { items: keptItems, shippingMethod: stored.shippingMethod, ...(couponCode ? { couponCode } : {}), ...(giftCardCode ? { giftCardCode } : {}), ...(stored.useCredit ? { useCredit: true } : {}) },
  };
}

const PINCODE = /^[1-9][0-9]{5}$/;
/** No cash on delivery for these pin-code prefixes (a business rule, same on both sides). */
const COD_BLOCKED_PREFIXES = ['7', '8'];

/** Why a pin code can't be delivered to, or `undefined` when it can. Doesn't throw: the mock throws an
 * `ApiException`, the real API an `AppError`, each with its own message text for the same reason code. */
export function deliverabilityProblem(pincode: string, serviceable: (pincode: string) => boolean): 'invalid' | 'not_deliverable' | undefined {
  if (!PINCODE.test(pincode)) return 'invalid';
  if (!serviceable(pincode)) return 'not_deliverable';
  return undefined;
}

export function codEligibility(pincode: string, total: number): { enabled: boolean; reason?: string } {
  if (total > COD_MAX_TOTAL) return { enabled: false, reason: 'Cash on delivery is available for orders up to ₹5,000.' };
  if (COD_BLOCKED_PREFIXES.includes(pincode[0])) return { enabled: false, reason: 'Cash on delivery is not available for this pin code.' };
  return { enabled: true };
}
