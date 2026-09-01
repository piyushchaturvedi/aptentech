import { z } from 'zod';
import { ACCENT_TOKENS, ADMIN_ROLES, LEAD_STATUSES, PUBLISH_STATUSES, SERVICE_KINDS } from '../types/primitives';

/**
 * A URL an editor may store and the site may render in an `href`.
 *
 * Only site-relative paths, mailto/tel, and absolute http(s) URLs are allowed. This blocks
 * `javascript:` and `data:` URIs (a stored-XSS sink if an editor account is compromised)
 * and keeps arbitrary off-site redirects out of the CMS. Bracket placeholders such as
 * `[EMAIL ADDRESS]` are permitted deliberately: the original content is full of them and
 * the brief requires preserving placeholders rather than inventing real values.
 */
export const safeHref = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) =>
      v === '' ||
      v === '#' ||
      v.startsWith('/') ||
      v.startsWith('#') ||
      /^https?:\/\//i.test(v) ||
      /^mailto:/i.test(v) ||
      /^tel:/i.test(v) ||
      /^\[[^\]]+\]$/.test(v) ||
      /^(mailto|tel):\[[^\]]+\]$/i.test(v),
    { message: 'Link must be a site path, #anchor, http(s) URL, mailto:, tel:, or a placeholder' },
  );

export const accentSchema = z.enum(ACCENT_TOKENS).catch('indigo');
export const publishStatusSchema = z.enum(PUBLISH_STATUSES);
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const adminRoleSchema = z.enum(ADMIN_ROLES);
export const serviceKindSchema = z.enum(SERVICE_KINDS);

/** Slugs are lowercase kebab-case. Existing slugs are preserved exactly. */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase words separated by hyphens');

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const mediaRefSchema = z.object({
  mediaId: objectIdSchema.nullable().default(null),
  legacyPath: z.string().trim().max(512).nullable().default(null),
  alt: z.string().trim().max(300).default(''),
  width: z.number().int().positive().max(10000).nullable().default(null),
  height: z.number().int().positive().max(10000).nullable().default(null),
});

export const ctaLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  href: safeHref,
  style: z.enum(['primary', 'mint', 'outline', 'glass', 'ghostLight']).default('primary'),
});

export const seoSchema = z.object({
  title: z.string().trim().max(200).default(''),
  description: z.string().trim().max(400).default(''),
  canonical: safeHref.default(''),
  ogTitle: z.string().trim().max(200).default(''),
  ogDescription: z.string().trim().max(400).default(''),
  ogImage: mediaRefSchema.default({ mediaId: null, legacyPath: null, alt: '', width: null, height: null }),
  robotsIndex: z.boolean().default(true),
  robotsFollow: z.boolean().default(true),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Coerces a query-string value to a plain string.
 *
 * Express parses `?status[$ne]=NEW` into an object. Passing that straight into a Mongo
 * filter is the classic NoSQL-injection route, so every user-supplied filter value is
 * forced through this before it can reach a repository.
 */
export const queryString = z.preprocess(
  (v) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined),
  z.string().trim().max(200).optional(),
);
