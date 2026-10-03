import type { ImageRef } from './catalog.js';

/** Marketing needs an explicit opt-in with a timestamp; order updates cannot be switched off, so it is not a field here. */
export interface NotificationPreferences {
  marketing: boolean;
  marketingConsentAt?: string;
  priceDropAlerts: boolean;
  backInStockAlerts: boolean;
}

export type NotificationKind = 'order' | 'review' | 'price_drop' | 'back_in_stock' | 'account' | 'support';

/** One notification-centre (bell) entry. */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app path to open when the shopper clicks it. */
  link?: string;
  createdAt: string;
  read: boolean;
}

export type AlertKind = 'back_in_stock' | 'price_drop';

/** A shopper's "notify me" or "alert me" subscription on one variant. */
export interface AlertSubscription {
  id: string;
  kind: AlertKind;
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  image: ImageRef;
  createdAt: string;
  /** `price_drop` only, paise: fires again when the price falls below this. */
  watchPrice?: number;
}

/** One saved edit of a template; used for "previous versions can be restored". */
export interface MessageTemplateVersion {
  version: number;
  subject: string;
  body: string;
  updatedAt: string;
  updatedBy: string;
}

/** An editable message sent by the platform. `variables` is the fixed, known set `{{like_this}}` may use. */
export interface MessageTemplate {
  key: string;
  name: string;
  description: string;
  kind: NotificationKind;
  variables: readonly string[];
  subject: string;
  body: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  history: MessageTemplateVersion[];
}

export type DeliveryStatus = 'sent' | 'failed';

export interface DeliveryLogEntry {
  id: string;
  templateKey: string;
  to: string;
  subject: string;
  status: DeliveryStatus;
  reason?: string;
  at: string;
  /** How many times this send was attempted, including retries. */
  attempts: number;
}

export interface DeliveryQuery {
  q?: string;
  status?: DeliveryStatus;
  page: number;
  pageSize: number;
}
