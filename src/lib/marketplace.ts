import type { Money } from './money.js';

/**
 * Marketplace rules (BRD 17): sellers, their products, shipments, commission and payout statements. Pure functions shared
 * by the mock adapters and, later, the real backend, so "what a seller is owed" is defined exactly once.
 */

// ---------- sellers and KYC (MP-01) ----------

export type SellerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export const SELLER_STATUS_LABEL: Record<SellerStatus, string> = { pending: 'Awaiting review', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };

export interface SellerAddress {
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

export interface SellerPolicies {
  returns: string;
  shipping: string;
}

/** What an applicant submits. The full bank account number is only ever in this request. */
export interface SellerApplicationInput {
  displayName: string;
  legalName: string;
  phone: string;
  gstin: string;
  pan: string;
  address: SellerAddress;
  bankHolder: string;
  bankAccountNumber: string;
  bankIfsc: string;
  policies: SellerPolicies;
}

export interface Seller {
  id: string;
  ownerUserId: string;
  displayName: string;
  legalName: string;
  phone: string;
  gstin: string;
  pan: string;
  address: SellerAddress;
  bankHolder: string;
  bankIfsc: string;
  /** Only the last four digits are kept; a real backend vaults the rest with the payment provider. */
  bankAccountLast4: string;
  policies: SellerPolicies;
  status: SellerStatus;
  rejectionReason?: string;
  /** Percent. When set it overrides category and default commission for this seller. */
  commissionRate?: number;
  appliedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

/** The part of a seller shoppers may see (MP-05). Nothing about KYC or bank details. */
export interface PublicSeller {
  id: string;
  displayName: string;
  rating: { average: number; count: number };
  policies: SellerPolicies;
  since: string;
}

export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PHONE = /^[6-9][0-9]{9}$/;
const PINCODE = /^[1-9][0-9]{5}$/;

/** Field messages for an application; `{}` when valid. Identifiers are checked after upper-casing and trimming. */
export function sellerApplicationProblems(input: SellerApplicationInput): Record<string, string> {
  const f: Record<string, string> = {};
  const text = (name: string, value: string, label: string, max = 80) => {
    if (!value?.trim()) f[name] = `${label} is required`;
    else if (value.trim().length > max) f[name] = `At most ${max} characters`;
  };
  text('displayName', input.displayName, 'Store name', 60);
  text('legalName', input.legalName, 'Legal name');
  if (!PHONE.test((input.phone ?? '').trim())) f['phone'] = 'Enter a valid 10-digit mobile number';
  if (!GSTIN.test((input.gstin ?? '').trim().toUpperCase())) f['gstin'] = 'Enter a valid 15-character GSTIN';
  if (!PAN.test((input.pan ?? '').trim().toUpperCase())) f['pan'] = 'Enter a valid 10-character PAN';
  text('address.line1', input.address?.line1, 'Address');
  text('address.city', input.address?.city, 'City');
  text('address.state', input.address?.state, 'State');
  if (!PINCODE.test((input.address?.pincode ?? '').trim())) f['address.pincode'] = 'Enter a valid 6-digit pin code';
  text('bankHolder', input.bankHolder, 'Account holder name');
  if (!/^[0-9]{9,18}$/.test((input.bankAccountNumber ?? '').trim())) f['bankAccountNumber'] = 'Enter the account number (9 to 18 digits)';
  if (!IFSC.test((input.bankIfsc ?? '').trim().toUpperCase())) f['bankIfsc'] = 'Enter a valid IFSC code';
  text('policies.returns', input.policies?.returns, 'Returns policy', 300);
  text('policies.shipping', input.policies?.shipping, 'Shipping policy', 300);
  return f;
}

// ---------- seller products (MP-02, MP-06) ----------

export type SellerProductStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export const SELLER_PRODUCT_STATUS_LABEL: Record<SellerProductStatus, string> = { draft: 'Draft', pending: 'Awaiting approval', approved: 'Live', rejected: 'Not approved' };

export interface SellerProduct {
  id: string;
  sellerId: string;
  title: string;
  brandName: string;
  categoryId: string;
  description: string;
  /** Paise. */
  price: number;
  /** Paise. */
  mrp?: number;
  /** Units on hand, as the seller last set them. */
  stock: number;
  status: SellerProductStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SellerProductInput {
  id?: string;
  title: string;
  brandName: string;
  categoryId: string;
  description: string;
  price: number;
  mrp?: number;
  stock: number;
}

export function sellerProductProblems(input: SellerProductInput, categoryExists: (id: string) => boolean): Record<string, string> {
  const f: Record<string, string> = {};
  if (!input.title?.trim()) f['title'] = 'Give the product a title';
  else if (input.title.trim().length > 120) f['title'] = 'At most 120 characters';
  if (!input.brandName?.trim()) f['brandName'] = 'Brand is required';
  if (!categoryExists(input.categoryId)) f['categoryId'] = 'Choose a category';
  if (!input.description?.trim()) f['description'] = 'Describe the product';
  else if (input.description.length > 2000) f['description'] = 'At most 2000 characters';
  if (!Number.isInteger(input.price) || input.price < 100 || input.price > 10_000_000) f['price'] = 'Enter a price from ₹1 to ₹1,00,000';
  if (input.mrp !== undefined && (!Number.isInteger(input.mrp) || input.mrp < input.price)) f['mrp'] = 'The MRP cannot be below the selling price';
  if (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > 100_000) f['stock'] = 'Enter a whole number of units from 0 to 100,000';
  return f;
}

// ---------- shipments (MP-04) ----------

export type ShipmentStatus = 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
export const SHIPMENT_FLOW: ShipmentStatus[] = ['confirmed', 'packed', 'shipped', 'delivered'];
export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = { confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };

/** The part of an order one seller ships. A multi-seller cart becomes one shipment per seller, each with its own status. */
export interface Shipment {
  id: string;
  orderId: string;
  /** `null` for the store's own items. */
  sellerId: string | null;
  sellerName: string;
  variantIds: string[];
  status: ShipmentStatus;
  trackingNumber?: string;
  timeline: { status: ShipmentStatus; at: string }[];
  /** Set once this shipment is on an issued payout statement. */
  statementId?: string;
}

/** The overall state of an order made of shipments: the least advanced shipment, or cancelled when all are. */
export function orderStatusFromShipments(statuses: ShipmentStatus[]): ShipmentStatus {
  const live = statuses.filter((s) => s !== 'cancelled');
  if (live.length === 0) return 'cancelled';
  return live.reduce((a, b) => (SHIPMENT_FLOW.indexOf(b) < SHIPMENT_FLOW.indexOf(a) ? b : a));
}

/** Allowed next steps for a seller: one step forward at a time, and shipping needs a tracking number. */
export const SELLER_NEXT: Partial<Record<ShipmentStatus, ShipmentStatus>> = { confirmed: 'packed', packed: 'shipped', shipped: 'delivered' };

// ---------- commission and payouts (MP-03) ----------

export interface CommissionRule {
  id: string;
  scope: 'default' | 'category' | 'seller';
  categoryId?: string;
  sellerId?: string;
  /** Percent, 0 to 50. */
  percent: number;
}

export const DEFAULT_COMMISSION_PERCENT = 10;

/**
 * The commission percent for one sale. Most specific wins: a seller's own override, then a rule for the seller, then a
 * category rule (the leaf category or any parent), then the default rule, then the platform default.
 */
export function commissionPercent(rules: CommissionRule[], seller: Pick<Seller, 'id' | 'commissionRate'> | undefined, categoryPath: string[]): number {
  if (seller?.commissionRate !== undefined) return seller.commissionRate;
  const forSeller = rules.find((r) => r.scope === 'seller' && r.sellerId === seller?.id);
  if (forSeller) return forSeller.percent;
  // categoryPath runs root to leaf; the leaf is the most specific.
  for (const id of [...categoryPath].reverse()) {
    const rule = rules.find((r) => r.scope === 'category' && r.categoryId === id);
    if (rule) return rule.percent;
  }
  return rules.find((r) => r.scope === 'default')?.percent ?? DEFAULT_COMMISSION_PERCENT;
}

export interface StatementLine {
  shipmentId: string;
  orderId: string;
  deliveredAt: string;
  /** Paise: what the shopper paid for the seller's items in this shipment, after offers. */
  gross: number;
  percent: number;
  commission: number;
  net: number;
}

export interface StatementAdjustment {
  returnId: string;
  orderId: string;
  refundedAt: string;
  gross: number;
  percent: number;
  commission: number;
  net: number;
}

export interface PayoutStatement {
  id: string;
  sellerId: string;
  sellerName: string;
  /** Inclusive yyyy-mm-dd. */
  from: string;
  to: string;
  lines: StatementLine[];
  adjustments: StatementAdjustment[];
  gross: number;
  commission: number;
  net: number;
  status: 'issued' | 'paid';
  issuedAt: string;
  paidAt?: string;
  reference?: string;
}

export interface PayoutPreview {
  sellerId: string;
  sellerName: string;
  from: string;
  to: string;
  lines: StatementLine[];
  adjustments: StatementAdjustment[];
  gross: number;
  commission: number;
  net: number;
}

/** Splits an amount into the platform's commission and the seller's net. Commission rounds down to a whole paisa. */
export function splitCommission(gross: number, percent: number): { commission: number; net: number } {
  const commission = Math.floor((gross * percent) / 100);
  return { commission, net: gross - commission };
}

/** Totals for a statement. A return reverses the sale: negative gross, and the commission on it is handed back. */
export function statementTotals(lines: StatementLine[], adjustments: StatementAdjustment[]): { gross: number; commission: number; net: number } {
  const gross = lines.reduce((n, l) => n + l.gross, 0) + adjustments.reduce((n, a) => n + a.gross, 0);
  const commission = lines.reduce((n, l) => n + l.commission, 0) + adjustments.reduce((n, a) => n + a.commission, 0);
  return { gross, commission, net: gross - commission };
}

// ---------- ratings (MP-05) ----------

/** A seller's rating: the review-count-weighted mean across all their products' ratings. */
export function sellerRating(products: { rating: { average: number; count: number } }[]): { average: number; count: number } {
  const count = products.reduce((n, p) => n + p.rating.count, 0);
  if (count === 0) return { average: 0, count: 0 };
  return { average: Math.round((products.reduce((n, p) => n + p.rating.average * p.rating.count, 0) / count) * 10) / 10, count };
}

export const inr = (amount: number): Money => ({ amount, currency: 'INR' });

/** What a seller sees of a shipment's customer: only what is needed to deliver it (business rule 1). */
export interface SellerShipmentView {
  id: string;
  orderId: string;
  placedAt: string;
  status: ShipmentStatus;
  trackingNumber?: string;
  items: { title: string; options: Record<string, string>; quantity: number; unitPrice: Money }[];
  /** Ship-to details only: no email, no payment details, no other sellers' items. */
  shipTo: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
  timeline: Shipment['timeline'];
}
