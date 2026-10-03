import type { Product } from './catalog.js';
import type { TrackedEvent } from './recommendations.js';

/**
 * Aggregate reporting over tracked events (BRD 16). Pure functions, shared by the mock admin API and, later, the real
 * reporting service. Everything here is an aggregate: there is deliberately no function that returns one shopper's activity
 * (business rule 1). Visitor ids are only counted, never listed.
 */

const DAY = 86_400_000;
export const REPORT_DAYS = [7, 30, 90] as const;

export type ReportKey = 'funnel' | 'products' | 'search' | 'campaigns' | 'cohorts';
export const REPORT_LABEL: Record<ReportKey, string> = { funnel: 'Shopping funnel', products: 'Product performance', search: 'Search', campaigns: 'Campaigns', cohorts: 'Cohorts and retention' };

const within = (e: TrackedEvent, now: number, days: number) => now - new Date(e.at).getTime() <= days * DAY && new Date(e.at).getTime() <= now;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const qty = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 1);

// ---------- funnel (AN-01) ----------

export interface FunnelStep {
  key: 'product_view' | 'add_to_cart' | 'checkout_start' | 'payment_start' | 'purchase';
  label: string;
  /** Distinct anonymous visitors who reached this step in the period. */
  visitors: number;
  /** Share of the previous step's visitors who did not continue; null for the first step. */
  dropOffPercent: number | null;
  /** Share of the first step's visitors who reached this one. */
  ofFirstPercent: number;
}

const FUNNEL: { key: FunnelStep['key']; label: string }[] = [
  { key: 'product_view', label: 'Viewed a product' },
  { key: 'add_to_cart', label: 'Added to cart' },
  { key: 'checkout_start', label: 'Started checkout' },
  { key: 'payment_start', label: 'Started payment' },
  { key: 'purchase', label: 'Placed an order' },
];

const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export function funnel(events: TrackedEvent[], now: number, days: number): FunnelStep[] {
  const sets = new Map<string, Set<string>>(FUNNEL.map((f) => [f.key, new Set<string>()]));
  for (const e of events) if (within(e, now, days)) sets.get(e.name)?.add(e.vid);
  const counts = FUNNEL.map((f) => sets.get(f.key)?.size ?? 0);
  return FUNNEL.map((f, i) => ({
    key: f.key,
    label: f.label,
    visitors: counts[i],
    dropOffPercent: i === 0 ? null : pct(Math.max(0, counts[i - 1] - counts[i]), counts[i - 1]),
    ofFirstPercent: pct(counts[i], counts[0]),
  }));
}

// ---------- product performance (AN-02) ----------

export interface ProductPerformance {
  productId: string;
  title: string;
  views: number;
  adds: number;
  /** Add-to-cart events per view, as a percentage. */
  addRatePercent: number;
  units: number;
  orders: number;
  /** Paise: units bought times the price at purchase. Before discounts and shipping. */
  revenue: number;
  /** Units on hand now. */
  stock: number;
  /** Units sold as a share of units sold plus units still on hand. */
  sellThroughPercent: number;
}

export type ProductSort = 'views' | 'adds' | 'addRatePercent' | 'units' | 'revenue' | 'sellThroughPercent' | 'title';

export function productPerformance(events: TrackedEvent[], products: Product[], now: number, days: number): ProductPerformance[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = new Map<string, ProductPerformance & { orderIds: Set<string> }>();
  const row = (productId: string) => {
    let r = rows.get(productId);
    if (!r) {
      const p = byId.get(productId);
      if (!p) return undefined;
      r = { productId, title: p.title, views: 0, adds: 0, addRatePercent: 0, units: 0, orders: 0, revenue: 0, stock: p.variants.reduce((n, v) => n + v.stock, 0), sellThroughPercent: 0, orderIds: new Set() };
      rows.set(productId, r);
    }
    return r;
  };
  for (const e of events) {
    if (!within(e, now, days)) continue;
    const r = row(str(e.props?.['productId']) ?? '');
    if (!r) continue;
    if (e.name === 'product_view') r.views += 1;
    else if (e.name === 'add_to_cart') r.adds += qty(e.props?.['quantity']);
    else if (e.name === 'purchase') {
      const units = qty(e.props?.['quantity']);
      r.units += units;
      const unitPrice = e.props?.['unitPrice'];
      r.revenue += units * (typeof unitPrice === 'number' ? unitPrice : (byId.get(r.productId)?.variants[0]?.price.amount ?? 0));
      const orderId = str(e.props?.['orderId']);
      if (orderId) r.orderIds.add(orderId);
    }
  }
  return [...rows.values()].map(({ orderIds, ...r }) => ({ ...r, orders: orderIds.size, addRatePercent: pct(r.adds, r.views), sellThroughPercent: pct(r.units, r.units + r.stock) }));
}

export function sortPerformance(rows: ProductPerformance[], sort: ProductSort, dir: 'asc' | 'desc'): ProductPerformance[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const diff = sort === 'title' ? a.title.localeCompare(b.title) : a[sort] - b[sort];
    return diff * sign || a.productId.localeCompare(b.productId);
  });
}

// ---------- search (AN-03) ----------

export interface SearchRow {
  term: string;
  searches: number;
  /** Mean number of results returned. */
  avgResults: number;
  clicks: number;
  /** Result clicks per search, as a percentage. */
  clickThroughPercent: number;
}

export interface SearchReport {
  top: SearchRow[];
  zeroResults: SearchRow[];
}

const normaliseTerm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 50);

export function searchReport(events: TrackedEvent[], now: number, days: number, limit = 20): SearchReport {
  const rows = new Map<string, { searches: number; results: number; clicks: number; zero: number }>();
  const get = (term: string) => rows.get(term) ?? { searches: 0, results: 0, clicks: 0, zero: 0 };
  for (const e of events) {
    if (!within(e, now, days)) continue;
    const raw = str(e.props?.['term']);
    if (!raw) continue;
    const term = normaliseTerm(raw);
    if (!term) continue;
    const r = get(term);
    if (e.name === 'search' || e.name === 'search_zero_results') {
      r.searches += 1;
      r.results += typeof e.props?.['results'] === 'number' ? (e.props['results'] as number) : 0;
      if (e.name === 'search_zero_results') r.zero += 1;
    } else if (e.name === 'search_result_click') r.clicks += 1;
    else continue;
    rows.set(term, r);
  }
  const all: (SearchRow & { zero: number })[] = [...rows].filter(([, r]) => r.searches > 0).map(([term, r]) => ({ term, searches: r.searches, avgResults: Math.round(r.results / r.searches), clicks: r.clicks, clickThroughPercent: pct(r.clicks, r.searches), zero: r.zero }));
  const byCount = (a: SearchRow, b: SearchRow) => b.searches - a.searches || a.term.localeCompare(b.term);
  const strip = ({ zero: _z, ...row }: SearchRow & { zero: number }): SearchRow => row;
  return {
    top: all.filter((r) => r.zero < r.searches).sort(byCount).slice(0, limit).map(strip),
    zeroResults: all.filter((r) => r.zero > 0 && r.zero === r.searches).sort(byCount).slice(0, limit).map(strip),
  };
}

// ---------- campaigns (AN-05) ----------

/** One marketing touch: where a visit came from. Compared case-insensitively and limited to simple characters. */
export interface Touch {
  source: string;
  medium?: string;
  campaign?: string;
}

const CLEAN = /[^a-z0-9_.-]/g;
export const cleanTag = (value: string | null | undefined): string | undefined => {
  const v = (value ?? '').trim().toLowerCase().replace(CLEAN, '').slice(0, 40);
  return v || undefined;
};

export const touchKey = (t: Touch): string => [t.source, t.medium ?? 'none', t.campaign ?? 'none'].join('|');
export const parseTouch = (key: string | undefined): Touch | undefined => {
  if (!key) return undefined;
  const [source, medium, campaign] = key.split('|');
  if (!source) return undefined;
  return { source, ...(medium && medium !== 'none' ? { medium } : {}), ...(campaign && campaign !== 'none' ? { campaign } : {}) };
};
export const touchLabel = (t: Touch): string => [t.source, t.medium, t.campaign].filter(Boolean).join(' / ');

export interface CampaignRow {
  campaign: string;
  /** Orders where this was the first touch. */
  firstTouchOrders: number;
  /** Orders where this was the last touch. */
  lastTouchOrders: number;
  /** Paise of item revenue credited to the last touch. */
  lastTouchRevenue: number;
}

export function campaignReport(events: TrackedEvent[], now: number, days: number): CampaignRow[] {
  const orders = new Map<string, { first?: string; last?: string; revenue: number }>();
  for (const e of events) {
    if (e.name !== 'purchase' || !within(e, now, days)) continue;
    const orderId = str(e.props?.['orderId']);
    if (!orderId) continue;
    const o = orders.get(orderId) ?? { revenue: 0 };
    o.first ??= str(e.props?.['first_touch']);
    o.last ??= str(e.props?.['last_touch']);
    const unitPrice = e.props?.['unitPrice'];
    o.revenue += qty(e.props?.['quantity']) * (typeof unitPrice === 'number' ? unitPrice : 0);
    orders.set(orderId, o);
  }
  const rows = new Map<string, CampaignRow>();
  const get = (key: string): CampaignRow => rows.get(key) ?? { campaign: key, firstTouchOrders: 0, lastTouchOrders: 0, lastTouchRevenue: 0 };
  const label = (key: string | undefined) => touchLabel(parseTouch(key) ?? { source: 'direct' });
  for (const o of orders.values()) {
    const first = label(o.first);
    const last = label(o.last);
    const f = get(first);
    f.firstTouchOrders += 1;
    rows.set(first, f);
    const l = get(last);
    l.lastTouchOrders += 1;
    l.lastTouchRevenue += o.revenue;
    rows.set(last, l);
  }
  return [...rows.values()].sort((a, b) => b.lastTouchOrders - a.lastTouchOrders || b.firstTouchOrders - a.firstTouchOrders || a.campaign.localeCompare(b.campaign));
}

// ---------- cohorts (AN-04) ----------

export interface CohortRow {
  /** ISO date of the Monday that starts the cohort's week. */
  weekStart: string;
  /** Visitors whose first order fell in that week. */
  size: number;
  /** For week 0..n after the first order: share of the cohort that ordered in that week. Null when that week has not happened yet. */
  retentionPercent: (number | null)[];
}

const mondayOf = (ms: number): number => {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return d.getTime() - day * DAY;
};

/** Weekly cohorts of buyers and how many of them bought again in each following week. */
export function cohortTable(events: TrackedEvent[], now: number, weeks = 5): CohortRow[] {
  const orderWeeks = new Map<string, Set<number>>();
  for (const e of events) {
    if (e.name !== 'purchase') continue;
    const at = new Date(e.at).getTime();
    if (at > now) continue;
    const set = orderWeeks.get(e.vid) ?? new Set<number>();
    set.add(mondayOf(at));
    orderWeeks.set(e.vid, set);
  }
  const thisWeek = mondayOf(now);
  const starts = Array.from({ length: weeks }, (_, i) => thisWeek - (weeks - 1 - i) * 7 * DAY);
  return starts.map((start) => {
    const members = [...orderWeeks].filter(([, w]) => Math.min(...w) === start);
    const elapsed = Math.round((thisWeek - start) / (7 * DAY));
    return {
      weekStart: new Date(start).toISOString().slice(0, 10),
      size: members.length,
      retentionPercent: Array.from({ length: weeks }, (_, k) => (k > elapsed ? null : pct(members.filter(([, w]) => w.has(start + k * 7 * DAY)).length, members.length))),
    };
  });
}

// ---------- scheduling and export (AN-06) ----------

export interface ReportSchedule {
  id: string;
  report: ReportKey;
  /** Look-back period of the report. */
  days: number;
  frequency: 'daily' | 'weekly';
  recipient: string;
  createdBy: string;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt: string;
}

export interface ScheduleInput {
  report: ReportKey;
  days: number;
  frequency: ReportSchedule['frequency'];
  recipient: string;
}

export const FREQUENCY_MS: Record<ReportSchedule['frequency'], number> = { daily: DAY, weekly: 7 * DAY };

/** RFC 4180 CSV. Cells that start with = + - @ are prefixed with an apostrophe so spreadsheets don't run them as formulas. */
export function toCsv(header: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number): string => {
    let text = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
