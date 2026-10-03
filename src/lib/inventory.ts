/** Stock movement kinds. Quantities are signed: receipts and returns add, sales and damage subtract. */
export type MovementKind = 'receive' | 'sale' | 'cancellation' | 'return' | 'damage' | 'correction' | 'transfer';

export interface StockLocation {
  id: string;
  name: string;
  /** Lower numbers are used first when an order is fulfilled. */
  priority: number;
}

/** One permanent ledger entry. The ledger is append-only; stock on hand is baseline plus the sum of movements. */
export interface StockMovement {
  id: string;
  at: string;
  variantId: string;
  sku: string;
  productId: string;
  title: string;
  locationId: string;
  kind: MovementKind;
  /** Signed change in units. */
  quantity: number;
  reason: string;
  note?: string;
  actor: string;
  orderId?: string;
  /** Both halves of a transfer share this id. */
  transferId?: string;
}

export interface InventorySettings {
  /** Minutes an unpaid order holds its stock. */
  reservationMinutes: number;
  /** Default low-stock threshold in units. */
  lowStockThreshold: number;
}

export interface VariantPolicy {
  /** Overrides the default low-stock threshold. */
  threshold?: number;
  /** When set the variant can be bought at zero stock. */
  backorder: boolean;
  /** ISO date shown to shoppers for back-ordered items. */
  expectedDate?: string;
}

export interface InventoryRow {
  variantId: string;
  productId: string;
  sku: string;
  title: string;
  options: Record<string, string>;
  onHand: number;
  reserved: number;
  available: number;
  byLocation: Record<string, number>;
  threshold: number;
  /** True when this variant overrides the default threshold. */
  customThreshold: boolean;
  low: boolean;
  backorder: boolean;
  expectedDate?: string;
}

export interface InventoryAlert {
  variantId: string;
  sku: string;
  title: string;
  available: number;
  threshold: number;
  at: string;
}

export type InventoryFilter = 'all' | 'low' | 'out' | 'backorder';

export interface InventoryQuery {
  q?: string;
  filter: InventoryFilter;
  page: number;
  pageSize: number;
}

export interface MovementQuery {
  q?: string;
  kind?: MovementKind;
  page: number;
  pageSize: number;
}

export type AdjustKind = 'receive' | 'return' | 'damage' | 'correction';

/** Reason codes offered on the adjustment screen; a reason is mandatory. */
export const STOCK_REASONS: readonly { code: string; label: string; kinds: readonly AdjustKind[] }[] = [
  { code: 'received_shipment', label: 'Received shipment', kinds: ['receive'] },
  { code: 'customer_return', label: 'Customer return', kinds: ['return'] },
  { code: 'damaged', label: 'Damaged', kinds: ['damage'] },
  { code: 'expired', label: 'Expired', kinds: ['damage'] },
  { code: 'lost', label: 'Lost or missing', kinds: ['damage', 'correction'] },
  { code: 'found', label: 'Found', kinds: ['correction'] },
  { code: 'count_correction', label: 'Stock count correction', kinds: ['correction'] },
  { code: 'other', label: 'Other (explain in the note)', kinds: ['receive', 'return', 'damage', 'correction'] },
];

export interface StockAdjustInput {
  variantId: string;
  locationId: string;
  kind: AdjustKind;
  /** Positive units for receive, return and damage; a signed non-zero change for correction. */
  quantity: number;
  reason: string;
  note?: string;
}

export interface StockTransferInput {
  variantId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  note?: string;
}

export interface InventoryImportIssue {
  line: number;
  sku: string;
  message: string;
}

export interface InventoryImportReport {
  applied: number;
  skipped: InventoryImportIssue[];
  /** CSV of the skipped rows with a message column, ready to download. */
  errorCsv: string;
}
