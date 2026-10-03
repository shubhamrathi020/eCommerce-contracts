import type { ImageRef } from './catalog.js';
import type { Money } from './money.js';
import type { Order, OrderStatus, PaymentStatus } from './order.js';
import type { PaymentMethod } from './cart.js';
import type { Role } from './user.js';

export type ProductStatus = 'draft' | 'published' | 'archived';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  title: string;
  brandName: string;
  categoryName: string;
  status: ProductStatus;
  priceMin: Money;
  stockTotal: number;
  variantCount: number;
  image: ImageRef;
  updatedAt: string;
}

export type AdminProductSort = 'updated' | 'title' | 'price' | 'stock';

export interface AdminProductQuery {
  q?: string;
  status?: ProductStatus;
  sort: AdminProductSort;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface AdminVariantInput {
  id?: string;
  sku: string;
  options: Record<string, string>;
  /** Paise. */
  price: number;
  /** Paise. */
  mrp?: number;
  stock: number;
}

export interface AdminProductInput {
  title: string;
  brandName: string;
  categoryId: string;
  /** Plain text; paragraphs are separated by blank lines. */
  description: string;
  highlights: string[];
  tags: string[];
  status: ProductStatus;
  variants: AdminVariantInput[];
}

export interface AdminProductDetail extends AdminProductInput {
  id: string;
  slug: string;
  categoryName: string;
  variantAxes: string[];
  updatedAt: string;
}

export interface AdminCategoryOption {
  id: string;
  name: string;
}

export interface AdminOrderRow {
  id: string;
  createdAt: string;
  customerName: string;
  itemCount: number;
  total: Money;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
}

export interface AdminOrderQuery {
  q?: string;
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  /** ISO dates (yyyy-mm-dd), inclusive. */
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface OrderNote {
  id: string;
  at: string;
  author: string;
  text: string;
}

export interface AdminOrderDetail extends Order {
  notes: OrderNote[];
  /** Statuses the order may move to next. */
  allowedNext: OrderStatus[];
}

export type CouponKind = 'percent' | 'flat' | 'free_shipping';

export interface AdminCoupon {
  code: string;
  description: string;
  kind: CouponKind;
  /** Percent for `percent`, paise for `flat`. */
  value: number;
  /** Paise. */
  minSubtotal: number;
  /** Paise cap for percent coupons. */
  maxDiscount?: number;
  expiresAt?: string;
  active: boolean;
  usageCount: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  emailVerified: boolean;
  createdAt: string;
  ordersCount: number;
}

export interface DashboardMetrics {
  days: number;
  revenue: Money;
  orders: number;
  averageOrderValue: Money;
  newCustomers: number;
  byDay: { date: string; revenue: number; orders: number }[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  topProducts: { title: string; units: number; revenue: Money }[];
  lowStock: { title: string; sku: string; stock: number }[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface AdminReviewRow {
  id: string;
  productId: string;
  productTitle: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  status: 'approved' | 'pending' | 'rejected';
  /** Why the automatic check held it back. */
  flagReason?: string;
  createdAt: string;
}
