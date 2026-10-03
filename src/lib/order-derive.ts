import type { OrderStatus } from './order.js';

/** Allowed order transitions (business rule 1 of BRD 06, still the rule for the real order state
 * machine in BRD 21/CM21-03): the one place this is defined, read by the mock admin API and the
 * real AdminOrderApi alike, so an "illegal transition" is the same on both sides. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
