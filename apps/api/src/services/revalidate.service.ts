import crypto from 'node:crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Cache invalidation.
 *
 * When an admin publishes, the API tells Next.js which cache tags to drop. That is what
 * lets content go live in seconds without a redeploy, which was an explicit requirement.
 *
 * The call is signed with an HMAC over the body. An unauthenticated revalidation endpoint
 * would let anyone force cache misses on demand — a cheap way to push load straight
 * through to MongoDB — so the receiving route verifies the signature before acting.
 *
 * Failures are logged, never thrown: a revalidation that does not land means content is
 * briefly stale, which must not turn a successful save into an error for the editor.
 */
export const revalidateService = {
  async byTags(tags: string[]): Promise<void> {
    if (!tags.length) return;

    const body = JSON.stringify({ tags, at: Date.now() });
    const signature = crypto.createHmac('sha256', env.REVALIDATE_SECRET).update(body).digest('hex');

    try {
      const res = await fetch(env.REVALIDATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-signature': signature },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        logger.warn({ status: res.status, tags }, 'Revalidation webhook returned a non-OK status');
      } else {
        logger.info({ tags }, 'Revalidation requested');
      }
    } catch (err) {
      logger.warn({ err, tags }, 'Revalidation webhook failed; content will refresh on its next ISR interval');
    }
  },
};

/** Cache tags, kept in one place so the API and the web app cannot drift apart. */
export const tags = {
  settings: 'settings',
  navigation: 'navigation',
  services: 'services',
  solutions: 'solutions',
  service: (slug: string) => `service:${slug}`,
  solution: (slug: string) => `solution:${slug}`,
  /** The list of pages and their statuses — what the navigation filters against. */
  pages: 'pages',
  page: (slug: string) => `page:${slug}`,
  blog: 'blog',
  post: (slug: string) => `post:${slug}`,
  caseStudies: 'case-studies',
  caseStudy: (slug: string) => `case-study:${slug}`,
  testimonials: 'testimonials',
  faqs: 'faqs',
};
