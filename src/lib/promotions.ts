import type { Money } from './money.js';
import { formatMoney } from './money-format.js';

/**
 * Promotion rules and the pure engine that evaluates them (BRD 14). Like `cart-derive.ts`, this is shared by the mock
 * adapters and, later, the real commerce API, so "which offers apply and why" is defined exactly once.
 * The browser never decides a discount: it only displays what `evaluatePromotions` returned (business rule 1).
 */

export type Segment = 'all' | 'first_order' | 'returning';
/** `exclusive` offers never combine with another offer or a coupon; `stackable` ones combine with each other and with a coupon. */
export type StackingMode = 'stackable' | 'exclusive';

interface PromotionBase {
  id: string;
  name: string;
  description?: string;
  /** Paused promotions never apply. */
  enabled: boolean;
  startsAt?: string;
  endsAt?: string;
  /** Higher wins ties and is applied first. */
  priority: number;
  segment: Segment;
  stacking: StackingMode;
  /** Seeded demo data whose window rolls forward on its own. Edited promotions lose the flag. */
  demo?: boolean;
}

export interface Scope {
  productIds?: string[];
  categoryIds?: string[];
}

/** Buy `buy`, get `get` more at `percentOff` off (100 = free). The cheapest matching units are the discounted ones. */
export interface BuyXGetYPromotion extends PromotionBase, Scope {
  kind: 'buy_x_get_y';
  buy: number;
  get: number;
  percentOff: number;
}

/** A percentage off the matching items once the basket reaches a tier (by spend in paise, or by unit count). */
export interface TieredPromotion extends PromotionBase, Scope {
  kind: 'tiered';
  basis: 'subtotal' | 'quantity';
  tiers: { min: number; percent: number }[];
}

export interface CategorySalePromotion extends PromotionBase {
  kind: 'category_sale';
  categoryIds: string[];
  percent: number;
}

/** A product at `dealPrice` for the first `cap` units sold; it ends at `endsAt` or when the cap sells out, whichever is first. */
export interface FlashDeal extends PromotionBase {
  kind: 'flash';
  productId: string;
  variantId?: string;
  /** Paise. */
  dealPrice: number;
  cap: number;
  perOrderLimit?: number;
}

export type Promotion = BuyXGetYPromotion | TieredPromotion | CategorySalePromotion | FlashDeal;

export const PROMOTION_KIND_LABEL: Record<Promotion['kind'], string> = { buy_x_get_y: 'Buy X get Y', tiered: 'Tiered discount', category_sale: 'Category sale', flash: 'Flash deal' };
export const SEGMENT_LABEL: Record<Segment, string> = { all: 'Everyone', first_order: 'First order only', returning: 'Returning customers' };

/** A saving shown as its own line in the cart. */
export interface AppliedPromotion {
  promotionId: string;
  name: string;
  /** Plain-language description of the saving, e.g. "Buy 2 get 1 free". */
  label: string;
  amount: Money;
  variantIds: string[];
  /** Flash deals: units that got the deal price. Used to count the cap down. */
  units?: number;
}

export interface RuleTrace {
  promotionId: string;
  name: string;
  outcome: 'applied' | 'skipped';
  /** Why it did or didn't apply, in words a person can act on. */
  reason: string;
  /** Paise saved when it would apply. */
  amount?: number;
}

export interface PromoLine {
  variantId: string;
  productId: string;
  categoryIds: string[];
  /** Paise. */
  unitPrice: number;
  quantity: number;
}

export interface PromotionContext {
  now: number;
  /** Orders this customer (or this device, for guests) has already placed and not cancelled. */
  priorOrders: number;
  /** Units still available per flash deal id; a missing entry means the full cap. */
  flashRemaining: Record<string, number>;
}

export interface PromotionOutcome {
  applied: AppliedPromotion[];
  /** Total promotion saving in paise. */
  discount: number;
  /** False when the chosen result is an exclusive offer, which cannot be combined with a coupon. */
  couponAllowed: boolean;
  trace: RuleTrace[];
}

const inr = (amount: number): Money => ({ amount: Math.round(amount), currency: 'INR' });
const hasScope = (s: Scope) => (s.productIds?.length ?? 0) > 0 || (s.categoryIds?.length ?? 0) > 0;
const inScope = (l: PromoLine, s: Scope) => !hasScope(s) || !!s.productIds?.includes(l.productId) || !!s.categoryIds?.some((c) => l.categoryIds.includes(c));
const lineValue = (l: PromoLine) => l.unitPrice * l.quantity;

/** Why a promotion cannot be considered at all right now, or `undefined` when it can. */
export function ineligibleReason(p: Promotion, ctx: PromotionContext): string | undefined {
  if (!p.enabled) return 'Paused';
  if (p.startsAt && new Date(p.startsAt).getTime() > ctx.now) return 'Has not started yet';
  if (p.endsAt && new Date(p.endsAt).getTime() < ctx.now) return 'Has ended';
  if (p.segment === 'first_order' && ctx.priorOrders > 0) return 'Only for a first order';
  if (p.segment === 'returning' && ctx.priorOrders === 0) return 'Only for returning customers';
  if (p.kind === 'flash' && (ctx.flashRemaining[p.id] ?? p.cap) <= 0) return 'Sold out';
  return undefined;
}

interface Candidate {
  /** Paise per variant. */
  allocation: Map<string, number>;
  label: string;
  units?: number;
}

/** What `p` would take off these lines, or the reason it takes nothing. Pure and independent of other promotions. */
function candidateFor(p: Promotion, lines: PromoLine[], ctx: PromotionContext): Candidate | string {
  const allocation = new Map<string, number>();
  const add = (variantId: string, amount: number) => allocation.set(variantId, (allocation.get(variantId) ?? 0) + amount);

  switch (p.kind) {
    case 'buy_x_get_y': {
      const matching = lines.filter((l) => inScope(l, p));
      const units = matching.flatMap((l) => Array.from({ length: l.quantity }, () => ({ variantId: l.variantId, price: l.unitPrice })));
      const size = p.buy + p.get;
      const groups = size > 0 ? Math.floor(units.length / size) : 0;
      if (groups === 0) return units.length === 0 ? 'No matching items in the cart' : `Needs ${size} matching items (the cart has ${units.length})`;
      const cheapest = [...units].sort((a, b) => a.price - b.price).slice(0, groups * p.get);
      for (const u of cheapest) add(u.variantId, Math.round((u.price * p.percentOff) / 100));
      return { allocation, label: p.percentOff >= 100 ? `Buy ${p.buy} get ${p.get} free` : `Buy ${p.buy} get ${p.get} at ${p.percentOff}% off` };
    }
    case 'tiered': {
      const matching = lines.filter((l) => inScope(l, p));
      if (matching.length === 0) return 'No matching items in the cart';
      const measure = p.basis === 'subtotal' ? matching.reduce((n, l) => n + lineValue(l), 0) : matching.reduce((n, l) => n + l.quantity, 0);
      const tiers = [...p.tiers].sort((a, b) => a.min - b.min);
      const reached = [...tiers].reverse().find((t) => measure >= t.min);
      if (!reached) {
        const first = tiers[0];
        return p.basis === 'subtotal' ? `Spend ${formatMoney(inr(first.min - measure))} more to reach the first tier` : `Add ${first.min - measure} more matching item(s) to reach the first tier`;
      }
      for (const l of matching) add(l.variantId, Math.floor((lineValue(l) * reached.percent) / 100));
      return { allocation, label: `${reached.percent}% off${p.basis === 'subtotal' ? ` when you spend ${formatMoney(inr(reached.min))}` : ` when you buy ${reached.min}+`}` };
    }
    case 'category_sale': {
      const matching = lines.filter((l) => inScope(l, p));
      if (matching.length === 0) return 'No items from the sale categories in the cart';
      for (const l of matching) add(l.variantId, Math.floor((lineValue(l) * p.percent) / 100));
      return { allocation, label: `${p.percent}% off` };
    }
    case 'flash': {
      const line = lines.find((l) => l.productId === p.productId && (!p.variantId || l.variantId === p.variantId));
      if (!line) return 'The deal item is not in the cart';
      if (p.dealPrice >= line.unitPrice) return 'The deal price is not lower than the current price';
      const units = Math.min(line.quantity, ctx.flashRemaining[p.id] ?? p.cap, p.perOrderLimit ?? Number.MAX_SAFE_INTEGER);
      if (units <= 0) return 'Sold out';
      add(line.variantId, (line.unitPrice - p.dealPrice) * units);
      return { allocation, label: `Deal price ${formatMoney(inr(p.dealPrice))} on ${units} unit${units === 1 ? '' : 's'}`, units };
    }
  }
}

/** Applies candidates in order, never letting the savings on a line exceed its value. */
function combine(chosen: { p: Promotion; c: Candidate }[], lines: PromoLine[]): { applied: AppliedPromotion[]; discount: number } {
  const room = new Map(lines.map((l) => [l.variantId, lineValue(l)]));
  const applied: AppliedPromotion[] = [];
  let discount = 0;
  for (const { p, c } of chosen) {
    let amount = 0;
    const variantIds: string[] = [];
    for (const [variantId, wanted] of c.allocation) {
      const take = Math.min(wanted, room.get(variantId) ?? 0);
      if (take <= 0) continue;
      room.set(variantId, (room.get(variantId) ?? 0) - take);
      amount += take;
      variantIds.push(variantId);
    }
    if (amount <= 0) continue;
    discount += amount;
    applied.push({ promotionId: p.id, name: p.name, label: c.label, amount: inr(amount), variantIds, ...(c.units ? { units: c.units } : {}) });
  }
  return { applied, discount };
}

/**
 * Picks the best allowed outcome (PE-03). Candidates are: every eligible stackable offer together (a coupon may join),
 * or one exclusive offer alone (no coupon). The largest total saving wins; a tie goes to the earlier candidate, and
 * candidates are ordered by priority then id, so the same cart always gets the same answer.
 * `couponDiscountFor` receives the subtotal after offers and returns what the shopper's coupon would take off.
 */
export function evaluatePromotions(lines: PromoLine[], promotions: Promotion[], ctx: PromotionContext, couponDiscountFor: (subtotalAfterOffers: number) => number = () => 0): PromotionOutcome {
  const ordered = [...promotions].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const trace: RuleTrace[] = [];
  const eligible: { p: Promotion; c: Candidate }[] = [];

  for (const p of ordered) {
    const blocked = ineligibleReason(p, ctx);
    if (blocked) {
      trace.push({ promotionId: p.id, name: p.name, outcome: 'skipped', reason: blocked });
      continue;
    }
    const result = candidateFor(p, lines, ctx);
    if (typeof result === 'string') trace.push({ promotionId: p.id, name: p.name, outcome: 'skipped', reason: result });
    else eligible.push({ p, c: result });
  }

  const subtotal = lines.reduce((n, l) => n + lineValue(l), 0);
  const score = (discount: number, couponAllowed: boolean) => discount + (couponAllowed ? couponDiscountFor(subtotal - discount) : 0);
  const stackableSet = eligible.filter((e) => e.p.stacking === 'stackable');
  const options = [
    { chosen: stackableSet, couponAllowed: true, label: 'the combination of stackable offers' },
    ...eligible.filter((e) => e.p.stacking === 'exclusive').map((e) => ({ chosen: [e], couponAllowed: false, label: `the exclusive offer "${e.p.name}"` })),
  ].map((o) => ({ ...o, ...combine(o.chosen, lines) }));

  let best = options[0];
  for (const o of options) if (score(o.discount, o.couponAllowed) > score(best.discount, best.couponAllowed)) best = o;

  const appliedIds = new Set(best.applied.map((a) => a.promotionId));
  for (const { p, c } of eligible) {
    const a = best.applied.find((x) => x.promotionId === p.id);
    if (a) trace.push({ promotionId: p.id, name: p.name, outcome: 'applied', reason: a.label, amount: a.amount.amount });
    else if (!appliedIds.has(p.id)) {
      const wanted = [...c.allocation.values()].reduce((n, v) => n + v, 0);
      trace.push({
        promotionId: p.id,
        name: p.name,
        outcome: 'skipped',
        reason: p.stacking === 'exclusive' ? `Exclusive offer: it would save ${formatMoney(inr(wanted))} but ${best.label} saves more, and exclusive offers cannot be combined` : `Not used: ${best.label} saves more and cannot be combined with it`,
        amount: wanted,
      });
    }
  }
  return { applied: best.applied, discount: best.discount, couponAllowed: best.couponAllowed, trace };
}

/** How a gift card is spent: the balance never goes negative (PE-05). Returns what to take and what is left. */
export function spendFrom(balance: number, due: number): { spent: number; left: number } {
  const spent = Math.max(0, Math.min(balance, due));
  return { spent, left: balance - spent };
}

// ---------- gift cards ----------

export interface GiftCardEntry {
  id: string;
  at: string;
  type: 'issue' | 'redeem' | 'refund' | 'adjust';
  /** Signed paise: issue and refund add, redeem subtracts. */
  amount: number;
  orderId?: string;
  actor: string;
  note?: string;
}

export interface GiftCard {
  code: string;
  initialAmount: number;
  balance: number;
  issuedTo?: string;
  expiresAt?: string;
  status: 'active' | 'disabled';
  entries: GiftCardEntry[];
  createdAt: string;
}

export interface GiftCardCheck {
  code: string;
  balance: Money;
  expiresAt?: string;
}

export interface IssueGiftCardInput {
  /** Paise. */
  amount: number;
  /** Leave empty to generate one. */
  code?: string;
  issuedTo?: string;
  /** yyyy-mm-dd */
  expiresOn?: string;
}

/** Why a gift card can't be used right now, or `undefined`. */
export function giftCardProblem(card: GiftCard | undefined, now: number): string | undefined {
  if (!card) return 'This gift card code is not valid.';
  if (card.status !== 'active') return 'This gift card has been disabled.';
  if (card.expiresAt && new Date(card.expiresAt).getTime() < now) return 'This gift card has expired.';
  if (card.balance <= 0) return 'This gift card has no balance left.';
  return undefined;
}

/** Everything the price engine needs to know about the shopper's wallet. Balances in paise. */
export interface WalletInput {
  giftCard?: { code: string; balance: number };
  credit?: number;
  useCredit?: boolean;
}

// ---------- admin simulator and price rules ----------

export interface SimulationInput {
  items: { variantId: string; quantity: number }[];
  couponCode?: string;
  /** Orders already placed by the imaginary customer: 0 means a first order. */
  priorOrders: number;
  /** ISO time to evaluate at; defaults to now. */
  at?: string;
}

export interface SimulationResult {
  /** Final price lines, exactly as a shopper's cart would show them. */
  subtotal: Money;
  promotionDiscount: Money;
  couponDiscount: Money;
  couponNote?: string;
  shipping: Money;
  total: Money;
  applied: AppliedPromotion[];
  trace: RuleTrace[];
}

export interface PriceHealthIssue {
  productId: string;
  variantId: string;
  sku: string;
  title: string;
  price: Money;
  mrp: Money;
  problem: string;
}

// ---------- API shapes ----------

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
/** What the admin form sends: a promotion without server-owned fields. `id` is absent when creating. */
export type PromotionInput = DistributiveOmit<Promotion, 'id' | 'demo'> & { id?: string };

/** A flash deal as the shop shows it. */
export interface DealView {
  id: string;
  name: string;
  productId: string;
  variantId?: string;
  slug: string;
  title: string;
  image: { url: string; alt: string; width: number; height: number };
  regularPrice: Money;
  dealPrice: Money;
  /** Units left at the deal price. */
  remaining: number;
  cap: number;
  endsAt: string;
}

export interface WalletSummary {
  credit: Money;
}

export interface ApplyWalletInput {
  /** A code to apply, or `null` to remove the current one. Omit to leave it unchanged. */
  giftCardCode?: string | null;
  useCredit?: boolean;
}
