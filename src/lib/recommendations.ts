import type { Product, ProductSummary } from './catalog.js';

/**
 * Explainable recommendation rules (BRD 15). Pure functions over tracked events and the catalog, shared by the mock
 * adapters and, later, the real service. No machine learning: every row can say why it shows what it shows.
 */

/** One tracked behaviour event. It carries an anonymous visitor id and no personal data (RC-01). */
export interface TrackedEvent {
  id: string;
  /** ISO time. */
  at: string;
  /** Random per-browser id; replaced when the shopper clears their history. Never an email, name or account id. */
  vid: string;
  name: string;
  props?: Record<string, string | number | boolean>;
  /** Demo data that makes the shop feel lived-in on day one. Real events never carry this. */
  seed?: boolean;
}

export type RecStrategy = 'similar' | 'bought_together' | 'trending' | 'best_sellers' | 'personalised';

export const REC_STRATEGY_LABEL: Record<RecStrategy, string> = {
  similar: 'Similar products',
  bought_together: 'Bought together',
  trending: 'Trending',
  best_sellers: 'Best sellers',
  personalised: 'Personalised for you',
};

/** Admin-controlled rules; they take effect on the next request, with no deploy (RC-05). */
export interface RecConfig {
  strategies: Record<RecStrategy, boolean>;
  /** Shown first wherever they are otherwise eligible. */
  pinned: string[];
  /** Never recommended. */
  excluded: string[];
  /** Score multipliers between 0.1 and 10. */
  boosts: Record<string, number>;
  /** Orders two products must share before they count as "bought together". */
  minTogether: number;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_REC_CONFIG: RecConfig = {
  strategies: { similar: true, bought_together: true, trending: true, best_sellers: true, personalised: true },
  pinned: [],
  excluded: [],
  boosts: {},
  minTogether: 2,
};

export interface RecItem {
  product: ProductSummary;
  /** Why this product is here, in plain words. */
  reason: string;
}

export interface RecRow {
  strategy: RecStrategy;
  title: string;
  /** One line under the title saying how the row was chosen. */
  subtitle?: string;
  /** True when a personalised row fell back to popular items (a new visitor, an opt-out, or too little history). */
  coldStart?: boolean;
  items: RecItem[];
}

/** Rows with fewer items than this are hidden rather than shown thin. */
export const MIN_ROW_ITEMS = 3;
/** A "bought together" bundle is meaningful with a pair, so it needs fewer items than a browse row. */
export const MIN_TOGETHER_ITEMS = 2;
export const MAX_ROW_ITEMS = 12;
/** A visitor needs this much behaviour weight before their own history drives the home page. */
export const MIN_PROFILE_WEIGHT = 4;

const DAY = 86_400_000;

/** How much each behaviour says about interest. */
export const EVENT_WEIGHT: Record<string, number> = { product_view: 1, add_to_cart: 3, purchase: 5 };

const num = (v: unknown, fallback = 1): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export interface ProductActivity {
  views: number;
  adds: number;
  /** Units bought. */
  units: number;
  score: number;
}

/** Activity per product over the last `days` days: views, carts and units bought. */
export function activityByProduct(events: TrackedEvent[], now: number, days: number): Map<string, ProductActivity> {
  const since = now - days * DAY;
  const out = new Map<string, ProductActivity>();
  for (const e of events) {
    const productId = str(e.props?.['productId']);
    if (!productId || !(e.name in EVENT_WEIGHT) || new Date(e.at).getTime() < since) continue;
    const a = out.get(productId) ?? { views: 0, adds: 0, units: 0, score: 0 };
    if (e.name === 'product_view') a.views += 1;
    else if (e.name === 'add_to_cart') a.adds += num(e.props?.['quantity']);
    else a.units += num(e.props?.['quantity']);
    a.score = a.views + 3 * a.adds + 5 * a.units;
    out.set(productId, a);
  }
  return out;
}

/** Products bought in the same order as `productId`, with how many orders they shared. Built from purchase events grouped by order. */
export function coPurchases(events: TrackedEvent[], productId: string): Map<string, number> {
  const baskets = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.name !== 'purchase') continue;
    const orderId = str(e.props?.['orderId']);
    const pid = str(e.props?.['productId']);
    if (!orderId || !pid) continue;
    const basket = baskets.get(orderId) ?? new Set<string>();
    basket.add(pid);
    baskets.set(orderId, basket);
  }
  const out = new Map<string, number>();
  for (const basket of baskets.values()) {
    if (!basket.has(productId)) continue;
    for (const other of basket) if (other !== productId) out.set(other, (out.get(other) ?? 0) + 1);
  }
  return out;
}

/** Why one product is "similar" to another: shared leaf category, brand, tags and a close price. Zero means unrelated. */
export function similarity(a: Product, b: Product): { score: number; reason: string } {
  if (a.id === b.id) return { score: 0, reason: '' };
  const sameLeaf = a.categoryId === b.categoryId;
  const sameRoot = a.categoryPath[0]?.id === b.categoryPath[0]?.id;
  const sameBrand = a.brandId === b.brandId;
  const tags = a.tags.filter((t) => b.tags.includes(t)).length;
  if (!sameLeaf && !sameRoot) return { score: 0, reason: '' };
  const pa = Math.min(...a.variants.map((v) => v.price.amount));
  const pb = Math.min(...b.variants.map((v) => v.price.amount));
  const closeness = Math.max(0, 1 - Math.abs(Math.log(pa / pb)));
  const score = (sameLeaf ? 3 : 1) + (sameBrand ? 2 : 0) + Math.min(tags, 3) + closeness;
  const bits = [sameLeaf ? `in ${b.categoryPath[b.categoryPath.length - 1]?.name ?? 'the same category'}` : 'in the same department', sameBrand ? `from ${b.brandName}` : '', tags > 0 ? `${tags} shared tag${tags === 1 ? '' : 's'}` : ''].filter(Boolean);
  return { score, reason: `Similar: ${bits.join(', ')}` };
}

export interface InterestProfile {
  categories: Map<string, number>;
  brands: Map<string, number>;
  /** Total weight of the behaviour behind the profile. Low means "new visitor". */
  weight: number;
  /** The product this visitor looked at most recently. */
  lastViewed?: string;
  bought: Set<string>;
}

/** What one visitor seems interested in, from their own recent events (30 days, newer counting more). */
export function interestProfile(events: TrackedEvent[], vid: string, products: Map<string, Product>, now: number): InterestProfile {
  const profile: InterestProfile = { categories: new Map(), brands: new Map(), weight: 0, bought: new Set() };
  let lastAt = 0;
  for (const e of events) {
    if (e.vid !== vid) continue;
    const productId = str(e.props?.['productId']);
    const product = productId ? products.get(productId) : undefined;
    const base = EVENT_WEIGHT[e.name];
    if (!product || !base) continue;
    const at = new Date(e.at).getTime();
    const age = (now - at) / DAY;
    if (age > 30) continue;
    if (e.name === 'purchase') profile.bought.add(product.id);
    const w = base * 0.5 ** (age / 7);
    profile.weight += w;
    profile.categories.set(product.categoryId, (profile.categories.get(product.categoryId) ?? 0) + w);
    profile.brands.set(product.brandId, (profile.brands.get(product.brandId) ?? 0) + w);
    if (e.name === 'product_view' && at >= lastAt) {
      lastAt = at;
      profile.lastViewed = product.id;
    }
  }
  return profile;
}

/** How well a product matches a profile. */
export function profileScore(p: Product, profile: InterestProfile): number {
  return (profile.categories.get(p.categoryId) ?? 0) * 2 + (profile.brands.get(p.brandId) ?? 0);
}

/**
 * Applies the admin rules to scored candidates and returns product ids in display order. Excluded products never appear,
 * boosts multiply the score, and pinned products that are eligible come first. Ties break by product id so output is stable.
 */
export function applyRules(scored: { id: string; score: number }[], config: RecConfig, pinnable: (id: string) => boolean = () => true, limit = MAX_ROW_ITEMS): string[] {
  const excluded = new Set(config.excluded);
  const boosted = scored.filter((s) => !excluded.has(s.id)).map((s) => ({ id: s.id, score: s.score * (config.boosts[s.id] ?? 1) }));
  boosted.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const pins = config.pinned.filter((id) => !excluded.has(id) && pinnable(id));
  return [...new Set([...pins, ...boosted.map((b) => b.id)])].slice(0, limit);
}

export interface RecStats {
  events: number;
  last7Days: number;
  byName: Record<string, number>;
  visitors: number;
}

export function eventStats(events: TrackedEvent[], now: number): RecStats {
  const byName: Record<string, number> = {};
  const vids = new Set<string>();
  let last7 = 0;
  for (const e of events) {
    byName[e.name] = (byName[e.name] ?? 0) + 1;
    vids.add(e.vid);
    if (now - new Date(e.at).getTime() < 7 * DAY) last7 += 1;
  }
  return { events: events.length, last7Days: last7, byName, visitors: vids.size };
}

/** One recommendation as the admin preview shows it, with the numbers behind it. */
export interface RecPreview {
  rows: RecRow[];
  stats: RecStats;
}
