import type { MetadataRoute } from 'next';
import { content } from '@/lib/api/content';
import { absoluteUrl } from '@/lib/seo/metadata';

/**
 * XML sitemap.
 *
 * Generated from the CMS, so a new service or article appears without anyone editing a
 * file. Every URL is absolute, HTTPS, on the apex host and trailing-slashed, matching the
 * canonicals exactly — a sitemap that disagrees with a page's canonical is worse than none.
 *
 * The source had no sitemap at all, and its footer "Sitemap" link pointed at `#`.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await content.sitemap();

  const entry = (path: string, updated?: string, priority = 0.7, frequency: 'daily' | 'weekly' | 'monthly' = 'weekly') => ({
    url: absoluteUrl(path),
    lastModified: updated ? new Date(updated) : new Date(),
    changeFrequency: frequency,
    priority,
  });

  return [
    entry('/', undefined, 1.0, 'weekly'),
    entry('/about/', undefined, 0.7, 'monthly'),
    entry('/contact/', undefined, 0.8, 'monthly'),
    entry('/case-studies/', undefined, 0.8, 'weekly'),
    entry('/blog/', undefined, 0.8, 'daily'),

    ...data.services.map((s) => entry(`/services/${s.slug}/`, s.updatedAt, 0.9, 'weekly')),
    ...data.solutions.map((s) => entry(`/solutions/${s.slug}/`, s.updatedAt, 0.9, 'weekly')),
    ...data.posts.map((p) => entry(`/blog/${p.slug}/`, p.updatedAt ?? p.publishedAt, 0.6, 'monthly')),

    entry('/privacy-policy/', undefined, 0.3, 'monthly'),
    entry('/terms-conditions/', undefined, 0.3, 'monthly'),
  ];
}
