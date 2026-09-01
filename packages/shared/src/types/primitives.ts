/**
 * Design primitives.
 *
 * The approved AptenTech design is locked. Content is admin-controlled, design is
 * developer-controlled. These types are the boundary between the two: an editor may
 * choose *which* accent or icon a card uses, but may never supply a raw colour value
 * or raw SVG. That keeps the palette and icon set inside the design system while
 * still letting the CMS drive every card on the site.
 *
 * The source HTML stored these as literal values (`c:'#3A31DB'`, `i:'<path d="..."/>'`).
 * Migrating them to closed enums is what stops an editor from breaking the design, and
 * — for icons — removes an HTML-injection sink that raw SVG in the database would create.
 */

/** The six brand accents defined on `:root` in the original stylesheet. */
export const ACCENT_TOKENS = ['indigo', 'mint', 'violet', 'amber', 'cyan', 'pink'] as const;
export type AccentToken = (typeof ACCENT_TOKENS)[number];

/** Maps the literal hex values found in the source HTML back onto accent tokens. */
export const HEX_TO_ACCENT: Readonly<Record<string, AccentToken>> = {
  '#3A31DB': 'indigo',
  '#00C9A7': 'mint',
  '#7C4DFF': 'violet',
  '#FF9D2E': 'amber',
  '#14B8E4': 'cyan',
  '#F0468A': 'pink',
};

/** Canonical hex for each accent, used only by the design layer. */
export const ACCENT_HEX: Readonly<Record<AccentToken, string>> = {
  indigo: '#3A31DB',
  mint: '#00C9A7',
  violet: '#7C4DFF',
  amber: '#FF9D2E',
  cyan: '#14B8E4',
  pink: '#F0468A',
};

export function accentFromHex(hex: string | undefined | null): AccentToken {
  if (!hex) return 'indigo';
  return HEX_TO_ACCENT[hex.toUpperCase()] ?? 'indigo';
}

/**
 * Publication state. `ARCHIVED` keeps a document out of the site without deleting it,
 * so an unpublished service can be restored rather than rebuilt.
 */
export const PUBLISH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

/** Lead lifecycle, exactly as specified. */
export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'WON',
  'LOST',
  'SPAM',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Admin roles. */
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Which page family a service document belongs to — decides its URL prefix.
 *
 * All four render through the same components and stylesheet, so a page added under any of
 * them inherits the approved design rather than introducing a new one. `industry` and
 * `technology` were added when the menus were given real destinations: every entry in them
 * promised a page, and pointing several at one shared screen is what made the navigation
 * look broken.
 */
export const SERVICE_KINDS = ['service', 'solution', 'industry', 'technology'] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

/**
 * A reference to an image.
 *
 * `legacyPath` preserves the exact `/images/...` path from the original HTML. None of
 * those files were delivered, so until an admin uploads a real asset the renderer draws
 * a layout-preserving placeholder at `width` x `height` — the box keeps its dimensions,
 * so nothing shifts and no image is invented. Uploading through the CMS sets `mediaId`
 * and the real image appears with no code change.
 */
export interface MediaRef {
  mediaId: string | null;
  legacyPath: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  /**
   * Resolved public URL, added by the API when it hydrates a document for reading.
   *
   * Never stored: content records only the media id, so moving buckets or putting a CDN in
   * front later is a configuration change rather than a data migration. It is `null` when
   * no asset has been uploaded yet, which is what the renderer keys off to draw a
   * layout-preserving placeholder instead.
   */
  url?: string | null;
}

export const EMPTY_MEDIA: MediaRef = {
  mediaId: null,
  legacyPath: null,
  alt: '',
  width: null,
  height: null,
};

/** A call-to-action button. `href` is validated as an internal path or safe absolute URL. */
export interface CtaLink {
  label: string;
  href: string;
  style: 'primary' | 'mint' | 'outline' | 'glass';
}

/** Per-page SEO overrides. Empty fields fall back to site defaults. */
export interface SeoFields {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: MediaRef;
  robotsIndex: boolean;
  robotsFollow: boolean;
}

export const EMPTY_SEO: SeoFields = {
  title: '',
  description: '',
  canonical: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: EMPTY_MEDIA,
  robotsIndex: true,
  robotsFollow: true,
};

/** Standard API envelope. Errors never carry internals — see `apps/api/src/middleware/error.ts`. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: Record<string, string[]> };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
