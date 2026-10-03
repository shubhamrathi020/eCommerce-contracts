import type { Money } from './money.js';

export interface ImageRef {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface Brand {
  id: string;
  slug: string;
  name: string;
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Products carrying this tag belong to the collection. */
  tag: string;
}

export interface Variant {
  id: string;
  sku: string;
  /** Option values keyed by variant axis, e.g. `{ size: 'M', colour: 'Black' }`. */
  options: Record<string, string>;
  price: Money;
  mrp?: Money;
  /** Units available to buy (on hand minus units held for unpaid orders). */
  stock: number;
  /** Present when the variant can be bought at zero stock; `expectedDate` is when it ships. */
  backorder?: { expectedDate?: string };
  images?: ImageRef[];
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'backorder';

export interface RatingSummary {
  average: number;
  count: number;
  /** Counts of 1..5 star reviews (index 0 is 1 star). */
  distribution: [number, number, number, number, number];
}

export interface CategoryRef {
  id: string;
  slug: string;
  name: string;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryPath: CategoryRef[];
  /** HTML; rendered through Angular's sanitiser. */
  description: string;
  highlights: string[];
  images: ImageRef[];
  /** Non-variant specifications, keyed by attribute definition key. */
  attributes: Record<string, string | number | boolean>;
  variantAxes: string[];
  variants: Variant[];
  rating: RatingSummary;
  tags: string[];
  createdAt: string;
  popularity: number;
  /** Previous slugs that must keep working (real backend answers with a 301). */
  slugHistory?: string[];
  sellerId?: string;
  seo?: { title?: string; description?: string };
}

/** Lightweight product shape for cards and lists. */
export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  brandName: string;
  categoryName: string;
  image: ImageRef;
  hoverImage?: ImageRef;
  priceMin: Money;
  priceMax: Money;
  /** MRP of the cheapest variant, when discounted. */
  mrpMin?: Money;
  rating: { average: number; count: number };
  stockStatus: StockStatus;
  stockLeft?: number;
  variantCount: number;
  /** Set when the product has exactly one purchasable variant (enables quick add). */
  quickAddVariantId?: string;
}

export interface ListingQuery {
  categorySlug?: string;
  brandSlug?: string;
  collectionSlug?: string;
  q?: string;
  /** Facet selections keyed by facet key (`brand`, `rating`, `availability`, `discount`, attribute keys). */
  filters: Record<string, string[]>;
  /** Price bounds in minor units (paise). */
  priceMin?: number;
  priceMax?: number;
  sort: SortKey;
  page: number;
  pageSize: number;
}

export type SortKey = 'relevance' | 'featured' | 'price-asc' | 'price-desc' | 'newest' | 'rating' | 'discount';

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface Facet {
  key: string;
  label: string;
  options: FacetOption[];
}

export interface ListingResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  facets: Facet[];
  /** Price bounds (paise) across the listing before the price filter is applied. */
  priceBounds: { min: number; max: number };
  /** Heading context for the page. */
  title: string;
  breadcrumb: CategoryRef[];
  /** Set when the query had no matches and results are shown for a close spelling instead. */
  correctedFrom?: string;
}

export interface SearchSuggestions {
  queries: string[];
  products: ProductSummary[];
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
}

export type ReviewStatus = 'approved' | 'pending' | 'rejected';

export interface Review {
  id: string;
  productId: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  verified: boolean;
  helpful: number;
  /** Absent means approved (seeded reviews). Shoppers only ever see approved reviews, plus their own held ones. */
  status?: ReviewStatus;
  /** True when the signed-in user wrote it. */
  mine?: boolean;
  /** True when the signed-in user marked it helpful. */
  voted?: boolean;
}

export interface ReviewInput {
  productId: string;
  rating: number;
  title: string;
  body: string;
}

export interface ReviewEligibility {
  canReview: boolean;
  /** Why not, when `canReview` is false. */
  reason?: 'sign_in' | 'not_purchased';
  /** The customer's existing review of this product, if any. */
  existing?: Review;
}

export type ReviewSort = 'recent' | 'helpful' | 'high' | 'low';

export interface ReviewQuery {
  sort: ReviewSort;
  page: number;
  pageSize: number;
}

export interface ReviewPage {
  items: Review[];
  total: number;
  summary: RatingSummary;
}

export interface Serviceability {
  serviceable: boolean;
  pincode: string;
  estimatedDays?: number;
  /** ISO date of the estimated delivery. */
  estimatedDate?: string;
  codAvailable?: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  link: string;
  image: ImageRef;
}

export interface ProductRow {
  key: string;
  title: string;
  link?: string;
  items: ProductSummary[];
}

export interface HomeData {
  banners: Banner[];
  categoryTiles: { slug: string; name: string; image: ImageRef }[];
  deals: { endsAt: string; items: ProductSummary[] };
  rows: ProductRow[];
  brands: Brand[];
}
