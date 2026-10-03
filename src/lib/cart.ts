import type { ImageRef } from './catalog.js';
import type { Money } from './money.js';
import type { AppliedPromotion } from './promotions.js';

export type ShippingMethodId = 'standard' | 'express';

export type CartLineIssue = 'out_of_stock' | 'quantity_reduced' | 'price_changed';

export interface CartLine {
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  brandName: string;
  image: ImageRef;
  options: Record<string, string>;
  unitPrice: Money;
  mrp?: Money;
  quantity: number;
  /** min(10, stock) */
  maxQuantity: number;
  lineTotal: Money;
  /** GST included in `lineTotal`. */
  taxIncluded: Money;
  issue?: CartLineIssue;
  /** Set when part or all of the line ships later because the item is on backorder. */
  backorder?: { expectedDate?: string };
  /** Present when `issue` is `price_changed`. */
  previousUnitPrice?: Money;
}

export interface AppliedCoupon {
  code: string;
  description: string;
  discount: Money;
  freeShipping: boolean;
}

export interface CartTotals {
  itemCount: number;
  /** Sum of selling prices. */
  subtotal: Money;
  /** Total saved versus MRP. */
  mrpSavings: Money;
  couponDiscount: Money;
  /** Automatic offers (BRD 14). Absent when none applied. */
  promotionDiscount?: Money;
  /** Gift card and store credit spent on this cart; `total` is what is left to pay. */
  giftCardApplied?: Money;
  creditApplied?: Money;
  shipping: Money;
  taxIncluded: Money;
  total: Money;
  /** How much more to spend for free standard shipping; absent once free. */
  amountToFreeShipping?: Money;
}

export interface Cart {
  lines: CartLine[];
  coupon?: AppliedCoupon;
  shippingMethod: ShippingMethodId;
  totals: CartTotals;
  /** Each automatic offer that applied, as its own saving line. */
  promotions?: AppliedPromotion[];
  /** Gift card on the cart, if any. */
  giftCardCode?: string;
  useCredit?: boolean;
  /** Human-readable notices from validation (price changes, reduced quantities). */
  notices: string[];
  /** True when at least one line blocks checkout (e.g. out of stock). */
  blocked: boolean;
}

export interface ShippingOption {
  id: ShippingMethodId;
  label: string;
  price: Money;
  estimatedDays: number;
  /** ISO date. */
  estimatedDate: string;
}

export type PaymentMethod = 'razorpay' | 'cod';

export interface PaymentOption {
  method: PaymentMethod;
  label: string;
  enabled: boolean;
  /** Why the option is unavailable. */
  reason?: string;
}
