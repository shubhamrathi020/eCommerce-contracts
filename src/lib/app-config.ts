export interface AppConfig {
  /** Use in-memory mock adapters instead of the real backend. */
  useMocks: boolean;
  /** Simulated latency for mock adapters (ms); ignored on the server. */
  mockLatencyMs?: number;
  /** Base URL of the backend API (e.g. `http://localhost:3333`). Used only by the HTTP adapters. */
  apiBaseUrl: string;
  /**
   * Sign-in, account and address book go to the real API (BRD 19) while everything not yet built on the
   * backend keeps using the mock adapters. `false` (the default) keeps the app fully on mocks.
   */
  realAuth?: boolean;
  /**
   * Catalog browsing, search and categories go to the real API (BRD 20) while everything not yet built on
   * the backend keeps using the mock adapters. `false` (the default) keeps the app fully on mocks.
   */
  realCatalog?: boolean;
  /**
   * Cart, checkout, orders and payments go to the real API (BRD 21) while everything not yet built on the
   * backend keeps using the mock adapters. `false` (the default) keeps the app fully on mocks. Payments
   * only actually work once the server has its own Razorpay test-mode keys (see apps/api/.env.example);
   * cash on delivery works either way.
   */
  realCommerce?: boolean;
  /** Public Razorpay key id only. Secrets never live in the frontend. */
  razorpayKeyId?: string;
  siteName: string;
  siteUrl: string;
  /** Where the customer storefront lives; the admin links to it (for example to a search page). */
  storefrontUrl?: string;
  features: Record<string, boolean>;
}
