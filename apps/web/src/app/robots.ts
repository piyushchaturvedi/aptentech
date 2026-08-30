import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/metadata';

/**
 * robots.txt.
 *
 * The admin is disallowed and the internal API routes are kept out of the index. The
 * sitemap is advertised absolutely, on the canonical host.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/').replace(/\/$/, ''),
  };
}
