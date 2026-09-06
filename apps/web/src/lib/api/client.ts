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

  const init: RequestInit & { next?: { tags?: string[]; revalidate?: number } } = {
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
  };

  /*
    Retries, and only for a connection that never completed.

    Two situations produce one: `npm run dev` starts both apps at once, so the first page
    opened can land while the API is still binding its port; and Node's fetch keeps sockets
    alive, so a request can pick up one the API has already closed and get `ECONNRESET`. Both
    look identical to the caller and both are fixed by trying again — the second attempt
    opens a new socket.

    An HTTP error is the API answering and is passed straight through, never retried. Reads
    are safe to repeat; a write is not, so it is attempted once.
  */
  const attempts = method === 'GET' ? 3 : 1;
  let res: Response | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      res = await fetch(`${API_BASE}${path}`, init);
      break;
    } catch (cause) {
      if (attempt === attempts - 1) throw cause;
      // Growing pause: long enough for a cold start, short enough not to hang a page.
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1) ** 2));
    }
  }

  if (!res) throw new ApiError(503, 'UNREACHABLE', 'The content service is unavailable');

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
  industries: 'industries',
  industry: (slug: string) => `industry:${slug}`,
  technologies: 'technologies',
  technology: (slug: string) => `technology:${slug}`,
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
