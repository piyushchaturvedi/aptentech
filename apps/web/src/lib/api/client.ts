import 'server-only';

/**
 * Server-side API client.
 *
 * This module is `server-only`, which makes it a build error for any client component to
 * import it. That is the mechanical guarantee behind the architecture rule: the service
 * token lives here, so it can never be bundled into browser JavaScript, and the browser
 * therefore never talks to the API — or to MongoDB — directly.
 *
 * Responses are cached by tag. A visitor's page view is served from the Next.js cache and
 * does not reach the API or the database; a cache miss (or an admin publishing, which
 * invalidates the tag) is what triggers a real request.
 */

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1';
const SERVICE_TOKEN = process.env.API_SERVICE_TOKEN ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions {
  tags?: string[];
  revalidate?: number | false;
  /** Opt out of caching entirely — used for lead submission and admin reads. */
  noStore?: boolean;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, string[]> };
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { tags, revalidate = 3600, noStore, method = 'GET', body, headers = {} } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'x-api-key': SERVICE_TOKEN,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(noStore
      ? { cache: 'no-store' as const }
      : { next: { tags, ...(revalidate === false ? {} : { revalidate }) } }),
  });

  let payload: Envelope<T>;
  try {
    payload = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', 'The content service returned an unreadable response');
  }

  if (!res.ok || !payload.success) {
    throw new ApiError(
      res.status,
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? 'The content service is unavailable',
    );
  }

  return payload.data as T;
}

/**
 * Returns null on 404 instead of throwing, so a route can call `notFound()` itself.
 * Any other failure still throws — a 500 from the API must not be rendered as a 404,
 * because that would quietly de-index a live page during an outage.
 */
async function optional<T>(path: string, options: FetchOptions = {}): Promise<T | null> {
  try {
    return await request<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const api = { request, optional };

/** Cache tags. Mirrors the API's tag names — the two must agree for invalidation to work. */
export const tags = {
  settings: 'settings',
  navigation: 'navigation',
  services: 'services',
  solutions: 'solutions',
  service: (slug: string) => `service:${slug}`,
  solution: (slug: string) => `solution:${slug}`,
  page: (slug: string) => `page:${slug}`,
  blog: 'blog',
  post: (slug: string) => `post:${slug}`,
  caseStudies: 'case-studies',
  caseStudy: (slug: string) => `case-study:${slug}`,
  testimonials: 'testimonials',
  faqs: 'faqs',
};
