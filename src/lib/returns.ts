import type { ImageRef } from './catalog.js';
import type { Money } from './money.js';
import type { Order } from './order.js';

// ---------- policy ----------

/** Why a customer is returning something. `ourFault` reasons get free return shipping and the shipping charge back. */
export const RETURN_REASONS: readonly { code: string; label: string; ourFault: boolean }[] = [
  { code: 'damaged', label: 'Arrived damaged', ourFault: true },
  { code: 'defective', label: 'Not working or defective', ourFault: true },
  { code: 'wrong_item', label: 'Received the wrong item', ourFault: true },
  { code: 'not_as_described', label: 'Not as described', ourFault: true },
  { code: 'size_fit', label: "Size or fit isn't right", ourFault: false },
  { code: 'changed_mind', label: 'I changed my mind', ourFault: false },
];

export const reasonOf = (code: string) => RETURN_REASONS.find((r) => r.code === code);

/** Return policy. Each request keeps a copy of the numbers it was created under, so edits only affect new requests (RF-07). */
export interface ReturnPolicy {
  /** Days after delivery during which a return may be requested. */
  windowDays: number;
  /** Paise deducted from the refund when the customer, not us, is the reason for the return. */
  returnFee: number;
  /** Whole categories that cannot be returned (matches any level of a product's category path). */
  excludedCategoryIds: string[];
  /** Individual products flagged non-returnable. */
  excludedProductIds: string[];
  updatedAt: string;
  updatedBy: string;
}

export const DEFAULT_RETURN_POLICY: ReturnPolicy = { windowDays: 7, returnFee: 4900, excludedCategoryIds: [], excludedProductIds: [], updatedAt: '2026-01-01T00:00:00Z', updatedBy: 'system' };

/** Attachments are metadata only in the mock (name, type, size); the real backend would store the file after a type/size check. */
export interface AttachmentMeta {
  name: string;
  type: string;
  size: number;
}

export const ATTACHMENT_LIMITS = { maxCount: 3, maxBytes: 2 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] } as const;

/** The first problem with a set of attachments, or null. Shared by the form (instant feedback) and the API (the real check). */
export function attachmentProblem(files: readonly AttachmentMeta[]): string | null {
  if (files.length > ATTACHMENT_LIMITS.maxCount) return `Attach at most ${ATTACHMENT_LIMITS.maxCount} files.`;
  for (const f of files) {
    if (!(ATTACHMENT_LIMITS.types as readonly string[]).includes(f.type)) return `${f.name}: only JPEG, PNG, WebP or PDF files are allowed.`;
    if (f.size > ATTACHMENT_LIMITS.maxBytes) return `${f.name}: files can be at most ${ATTACHMENT_LIMITS.maxBytes / 1024 / 1024} MB.`;
  }
  return null;
}

// ---------- return requests ----------

export type ReturnStatus = 'requested' | 'approved' | 'picked_up' | 'checked' | 'refunded' | 'rejected';
/** Statuses in which the items are still tied up in a request (one open request per item). */
export const OPEN_RETURN_STATUSES: readonly ReturnStatus[] = ['requested', 'approved', 'picked_up', 'checked'];
export type RefundMethod = 'original' | 'store_credit';
export type Disposition = 'restock' | 'scrap';

export interface ReturnItemSelection {
  variantId: string;
  quantity: number;
}

export interface ReturnItem {
  variantId: string;
  productId: string;
  slug: string;
  title: string;
  image: ImageRef;
  options: Record<string, string>;
  quantity: number;
  unitPrice: Money;
  /** Set when the quality check is recorded. */
  disposition?: Disposition;
}

/** How the refund was worked out. Computed by the API; the browser only displays it (RF-03). */
export interface RefundBreakdown {
  items: Money;
  /** The share of the order's coupon discount that belonged to these items; deducted. */
  discountShare: Money;
  shippingRefund: Money;
  /** Return shipping fee when the customer is the reason; deducted. */
  returnFee: Money;
  total: Money;
  method: RefundMethod;
  /** Plain-language note on the rules applied, e.g. why shipping is or isn't refunded. */
  notes: string[];
}

export interface ReturnTimelineEntry {
  status: ReturnStatus;
  label: string;
  at: string;
  note?: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  status: ReturnStatus;
  reason: string;
  comments: string;
  items: ReturnItem[];
  refund: RefundBreakdown;
  /** The policy numbers this request was made under. */
  policy: { windowDays: number; returnFee: number };
  attachments: AttachmentMeta[];
  pickup?: { date: string; note?: string };
  check?: { result: 'accepted' | 'rejected'; note: string; at: string; by: string };
  rejectionReason?: string;
  /** Set once refunded. */
  refundedAt?: string;
  timeline: ReturnTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ReturnLineEligibility {
  variantId: string;
  title: string;
  options: Record<string, string>;
  image: ImageRef;
  unitPrice: Money;
  ordered: number;
  /** Units already refunded. */
  returned: number;
  /** Units in a request that is still open. */
  inOpenRequest: number;
  /** Units that can be selected now. */
  returnable: number;
  /** Why `returnable` is zero (or the line cannot be chosen). */
  blockedReason?: string;
}

export interface ReturnEligibility {
  orderId: string;
  deliveredAt?: string;
  /** Last moment a return can be requested. */
  windowEndsAt?: string;
  /** False when nothing in the order can be returned right now; `reason` says why. */
  eligible: boolean;
  reason?: string;
  windowDays: number;
  returnFee: Money;
  lines: ReturnLineEligibility[];
}

export interface CreateReturnInput {
  orderId: string;
  items: ReturnItemSelection[];
  reason: string;
  comments: string;
  attachments: AttachmentMeta[];
}

export interface ReturnQuery {
  status?: ReturnStatus;
  q?: string;
  page: number;
  pageSize: number;
}

export interface ApproveReturnInput {
  /** ISO date (yyyy-mm-dd) of the courier pickup. */
  pickupDate: string;
  note?: string;
}

export interface QualityCheckInput {
  result: 'accepted' | 'rejected';
  note: string;
  /** Required when accepted: restock or scrap for every returned variant. */
  dispositions?: Record<string, Disposition>;
}

/** Money a cancelled, prepaid order is owed (and, once paid back, the record of it). Part of RF-04. */
export interface OrderRefund {
  orderId: string;
  amount: Money;
  method: RefundMethod;
  /** Absent while the refund is still pending. */
  refundedAt?: string;
}

export interface PendingOrderRefund {
  orderId: string;
  customerName: string;
  amount: Money;
  cancelledAt?: string;
}

// ---------- refund calculation ----------

const inr = (amount: number): Money => ({ amount, currency: 'INR' });

/**
 * Works out a refund. Rules (BRD 13 business rules, our chosen defaults):
 * - each item is refunded at the price paid, less its proportional share of any coupon and offer discounts;
 * - the shipping charge is refunded only when we are the reason for the return AND this request completes the return of the whole order;
 * - when the customer is the reason, the policy's return fee is deducted (never more than the items are worth);
 * - the money goes back to the original online payment when there was one; cash-on-delivery has no original method, so it becomes store credit.
 */
export function computeRefund(order: Order, items: ReturnItemSelection[], reasonCode: string, policy: { returnFee: number }, alreadyReturned: Record<string, number> = {}): RefundBreakdown {
  const reason = reasonOf(reasonCode);
  const ourFault = reason?.ourFault ?? false;
  const subtotal = order.totals.subtotal.amount;
  const discount = order.totals.couponDiscount.amount + (order.totals.promotionDiscount?.amount ?? 0);
  let gross = 0;
  let share = 0;
  const notes: string[] = [];
  for (const sel of items) {
    const line = order.lines.find((l) => l.variantId === sel.variantId);
    if (!line) continue;
    const value = line.unitPrice.amount * sel.quantity;
    gross += value;
    share += subtotal > 0 ? Math.round((discount * value) / subtotal) : 0;
  }
  if (share > 0) notes.push('A proportional share of the discounts you received is deducted.');

  const returnedAfter = (variantId: string) => (alreadyReturned[variantId] ?? 0) + (items.find((i) => i.variantId === variantId)?.quantity ?? 0);
  const wholeOrder = order.lines.every((l) => returnedAfter(l.variantId) >= l.quantity);
  let shipping = 0;
  if (ourFault && wholeOrder) {
    shipping = order.totals.shipping.amount;
    if (shipping > 0) notes.push('Shipping is refunded because the whole order is returned and the problem was ours.');
  } else if (order.totals.shipping.amount > 0) {
    notes.push(ourFault ? 'Shipping is refunded once every item in the order has been returned.' : 'Shipping is not refunded when you change your mind.');
  }

  const net = Math.max(0, gross - share);
  const fee = ourFault ? 0 : Math.min(policy.returnFee, net);
  if (fee > 0) notes.push('A return shipping fee applies because the return is not due to a problem on our side.');
  if (ourFault) notes.push('Return pickup is free.');

  const online = order.paymentMethod === 'razorpay' && order.paymentStatus === 'paid' && !order.tender;
  notes.push(online ? 'Refunded to your original payment method.' : order.tender ? 'Part of this order was paid with a gift card or store credit, so the refund is added to your store credit.' : 'Cash-on-delivery orders have no original payment method, so this is refunded as store credit.');
  return { items: inr(gross), discountShare: inr(share), shippingRefund: inr(shipping), returnFee: inr(fee), total: inr(net + shipping - fee), method: online ? 'original' : 'store_credit', notes };
}

// ---------- support tickets ----------

export type TicketStatus = 'open' | 'pending' | 'closed';

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = { open: 'Open', pending: 'Waiting for customer', closed: 'Closed' };

export interface TicketMessage {
  id: string;
  author: 'customer' | 'staff';
  authorName: string;
  body: string;
  attachments: AttachmentMeta[];
  at: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  /** The order this question is about, if any. */
  orderId?: string;
  status: TicketStatus;
  /** Staff member working on it. */
  assignee?: string;
  messages: TicketMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  subject: string;
  orderId?: string;
  message: string;
  attachments: AttachmentMeta[];
}

export interface ReplyInput {
  message: string;
  attachments?: AttachmentMeta[];
}

export interface TicketQuery {
  status?: TicketStatus;
  /** 'me' for tickets assigned to the signed-in staff member, 'none' for unassigned. */
  assignee?: 'me' | 'none';
  q?: string;
  page: number;
  pageSize: number;
}

export const TICKET_LIMITS = { subject: 120, message: 2000 } as const;
