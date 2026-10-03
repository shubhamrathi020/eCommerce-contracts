import type { Product, ProductSummary, Serviceability, SortKey, StockStatus, Variant } from './catalog.js';

/**
 * Pure product-derivation rules shared by the mock catalog (`@ecom/shared/data-access`) and the real
 * catalog API (`apps/api`), so "how a product becomes a card" is defined exactly once (steering/memory.md:
 * one source of truth on both sides of the mock/real boundary, the same pattern as `permissionsFor`).
 */

/** Stock at or below this many units (across variants) is shown as "Only N left". */
export const LOW_STOCK_THRESHOLD = 5;

const totalStock = (p: Product): number => p.variants.reduce((sum, v) => sum + v.stock, 0);

export function stockStatusOf(p: Product): { status: StockStatus; left?: number } {
  const stock = totalStock(p);
  if (stock === 0) return { status: p.variants.some((v) => v.backorder) ? 'backorder' : 'out_of_stock' };
  if (stock <= LOW_STOCK_THRESHOLD) return { status: 'low_stock', left: stock };
  return { status: 'in_stock' };
}

export const cheapestVariant = (p: Product): Variant => p.variants.reduce((a, b) => (b.price.amount < a.price.amount ? b : a));

function variantDiscount(v: Variant): number {
  if (!v.mrp || v.mrp.amount <= v.price.amount) return 0;
  return Math.round(((v.mrp.amount - v.price.amount) / v.mrp.amount) * 100);
}

export const bestDiscount = (p: Product): number => Math.max(...p.variants.map(variantDiscount));

export function toSummary(p: Product): ProductSummary {
  const cheapest = cheapestVariant(p);
  const prices = p.variants.map((v) => v.price.amount);
  const { status, left } = stockStatusOf(p);
  const buyable = p.variants.filter((v) => v.stock > 0 || v.backorder);
  const summary: ProductSummary = {
    id: p.id,
    slug: p.slug,
    title: p.title,
    brandName: p.brandName,
    categoryName: p.categoryPath[p.categoryPath.length - 1].name,
    image: p.images[0],
    priceMin: { amount: Math.min(...prices), currency: 'INR' },
    priceMax: { amount: Math.max(...prices), currency: 'INR' },
    rating: { average: p.rating.average, count: p.rating.count },
    stockStatus: status,
    variantCount: p.variants.length,
  };
  if (p.images[1]) summary.hoverImage = p.images[1];
  if (variantDiscount(cheapest) >= 1 && cheapest.mrp) summary.mrpMin = cheapest.mrp;
  if (left !== undefined) summary.stockLeft = left;
  if (p.variants.length === 1 && buyable.length === 1) summary.quickAddVariantId = buyable[0].id;
  return summary;
}

export function sortProducts(products: Product[], sort: SortKey, scores?: Map<string, number>): Product[] {
  const cmp: Record<SortKey, (a: Product, b: Product) => number> = {
    relevance: (a, b) => (scores?.get(b.id) ?? 0) - (scores?.get(a.id) ?? 0) || b.popularity - a.popularity,
    featured: (a, b) => b.popularity - a.popularity,
    'price-asc': (a, b) => cheapestVariant(a).price.amount - cheapestVariant(b).price.amount,
    'price-desc': (a, b) => cheapestVariant(b).price.amount - cheapestVariant(a).price.amount,
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    rating: (a, b) => b.rating.average - a.rating.average || b.rating.count - a.rating.count,
    discount: (a, b) => bestDiscount(b) - bestDiscount(a),
  };
  // Out-of-stock products rank last; ties break on id so the order is stable.
  return [...products].sort((a, b) => {
    const oos = Number(totalStock(a) === 0) - Number(totalStock(b) === 0);
    return oos || cmp[sort](a, b) || a.id.localeCompare(b.id);
  });
}

const DAY_MS = 86_400_000;

/** Deterministic mock delivery rules by pin-code prefix, shared by the product page and checkout on both
 * the mock frontend and the real backend, until BRD 21/25 wire up a real courier/logistics integration. */
export function computeServiceability(pincode: string, now = Date.now()): Serviceability {
  const first = Number(pincode[0]);
  if (first === 9) return { serviceable: false, pincode };
  const days = 2 + (first % 4);
  return { serviceable: true, pincode, estimatedDays: days, estimatedDate: new Date(now + days * DAY_MS).toISOString(), codAvailable: first % 2 === 0 };
}
