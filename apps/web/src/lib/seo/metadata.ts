import type { Metadata } from 'next';
import type { SeoFields, SiteSettings } from '@aptentech/shared';
import type { ResolvedMedia } from '@/lib/api/content';

/**
 * Metadata construction.
 *
 * Every page's title, description and canonical come from the CMS, falling back to site
 * defaults. Canonicals are always absolute, always on the production host and always
 * trailing-slashed, matching the 25 canonicals the source declared — the whole point is
 * that the migration does not move a single indexed URL.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aptentech.com').replace(/\/$/, '');

/** Builds an absolute, trailing-slashed URL on the canonical host. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const clean = `/${path.replace(/^\/+/, '')}`;
  const withSlash = clean.endsWith('/') || clean.includes('.') ? clean : `${clean}/`;
  return `${SITE_URL}${withSlash}`;
}

interface BuildOptions {
  seo: Partial<SeoFields> | undefined;
  settings: SiteSettings;
  path: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
  ogImage?: ResolvedMedia | null;
  type?: 'website' | 'article';
  publishedTime?: string | null;
}

export function buildMetadata({
  seo,
  settings,
  path,
  fallbackTitle,
  fallbackDescription,
  ogImage,
  type = 'website',
  publishedTime,
}: BuildOptions): Metadata {
  const defaults = settings.defaultSeo;

  const title = seo?.title || fallbackTitle || defaults?.title || settings.companyName;
  const description = seo?.description || fallbackDescription || defaults?.description || '';

  // A CMS canonical wins; otherwise it is derived from the route, so a page can never end
  // up self-referencing the wrong URL by omission.
  const canonical = seo?.canonical ? absoluteUrl(seo.canonical) : absoluteUrl(path);

  /*
    Social images must be absolute.

    A crawler fetches `og:image` from its own context, so a site-relative path — which the
    local media driver returns — resolves against the wrong host and the card renders blank.
  */
  const rawImage = ogImage?.url ?? defaults?.ogImage?.url ?? null;
  const image = rawImage ? (/^https?:\/\//i.test(rawImage) ? rawImage : absoluteUrl(rawImage)) : null;

  const robots = {
    index: seo?.robotsIndex ?? true,
    follow: seo?.robotsFollow ?? true,
  };

  return {
    title,
    description,
    alternates: { canonical },
    robots: {
      ...robots,
      googleBot: { index: robots.index, follow: robots.follow, 'max-image-preview': 'large' },
    },
    openGraph: {
      title: seo?.ogTitle || title,
      description: seo?.ogDescription || description,
      url: canonical,
      siteName: settings.companyName,
      type,
      ...(publishedTime ? { publishedTime } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      // The source declared a Twitter card on exactly one page of 25; every page gets one
      // now, so a shared link renders as a card rather than a bare URL.
      card: image ? 'summary_large_image' : 'summary',
      title: seo?.ogTitle || title,
      description: seo?.ogDescription || description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
