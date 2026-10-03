import type { Banner } from './catalog.js';

/** A home banner as managed by staff. `Banner` (image, title, link...) is what shoppers receive. */
export interface ContentBanner extends Banner {
  active: boolean;
  /** ISO date-times; empty means no limit. */
  startsAt?: string;
  endsAt?: string;
  order: number;
}

export type HomeSectionKey = 'categories' | 'deals' | 'featured' | 'new' | 'best' | 'brands' | 'recent';

export interface HomeSection {
  key: HomeSectionKey;
  title: string;
  enabled: boolean;
  order: number;
}

/** What the storefront home page needs from the content service. */
export interface HomeConfig {
  banners: Banner[];
  /** Enabled sections only, in display order. */
  sections: HomeSection[];
}

export type PageStatus = 'draft' | 'published';

export interface ManagedPage {
  slug: string;
  title: string;
  /** Editor text (see `renderContent`). */
  source: string;
  /** HTML generated from `source` on save, or trusted seed HTML. */
  body: string;
  status: PageStatus;
  seoTitle?: string;
  seoDescription?: string;
  updatedAt: string;
  /** Legal pages cannot be deleted. */
  locked: boolean;
}

export type LinkGroup = 'about' | 'help' | 'legal';

export interface NavLink {
  id: string;
  label: string;
  /** Internal path (`/pages/faq`) or `https://` address. */
  href: string;
  group: LinkGroup;
  order: number;
}

export interface Redirect {
  id: string;
  /** Path that is redirected (starts with `/`). */
  from: string;
  to: string;
  createdAt: string;
}
