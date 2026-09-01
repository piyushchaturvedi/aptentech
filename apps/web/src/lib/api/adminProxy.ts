import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Shared forwarding logic for admin API calls.
 *
 * The admin UI calls `/api/admin/...` same-origin; this forwards to the Node API
 * server-side, adding the service token and passing the session cookie and CSRF header
 * through untouched. Authorisation is still decided by the API on every request — this is
 * transport, and grants nothing on its own.
 */

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1';
const SERVICE_TOKEN = process.env.API_SERVICE_TOKEN ?? '';

const SKIP_REQUEST_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  // Let undici set this from the body it actually sends; a stale boundary or length here
  // is what silently truncates a multipart upload.
  'content-type',
  'accept-encoding',
]);

const SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
]);

export function buildForwardHeaders(request: NextRequest, extra: Record<string, string> = {}): Headers {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  headers.set('x-api-key', SERVICE_TOKEN);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);

  return headers;
}

export function toNextResponse(upstream: Response): NextResponse {
  const headers = new Headers();

  upstream.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  // Session cookies are issued by the API; pass them back to the browser verbatim.
  const setCookie = upstream.headers.getSetCookie?.() ?? [];
  headers.delete('set-cookie');
  for (const cookie of setCookie) headers.append('set-cookie', cookie);

  headers.set('cache-control', 'no-store, must-revalidate');

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export function upstreamUrl(path: string[], search = ''): string {
  return `${API_BASE}/admin/${path.map(encodeURIComponent).join('/')}${search}`;
}

export function unavailable(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The content service is not responding.' } },
    { status: 502 },
  );
}

/**
 * Sends the upstream request, retrying a connection that never completed.
 *
 * Node keeps sockets alive and reuses them, so a request can claim one the API has already
 * closed and fail with `ECONNRESET` before a byte is sent. Opening the dashboard should not
 * turn into a Bad Gateway because of that, and a second attempt opens a fresh socket.
 *
 * Only safe methods are repeated. A `POST` that dies mid-flight may still have been applied
 * upstream, so replaying it could create a second session or a duplicate record; those get
 * one attempt and an honest error. An HTTP status is the API answering and is never retried.
 */
export async function send(url: string, init: RequestInit, method: string): Promise<Response> {
  const attempts = method === 'GET' || method === 'HEAD' ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (cause) {
      lastError = cause;
      if (attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1) ** 2));
    }
  }

  throw lastError;
}

/** Forwards a JSON (or bodiless) admin request. */
export async function forwardJson(request: NextRequest, path: string[]): Promise<NextResponse> {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const raw = hasBody ? await request.text() : undefined;

  const headers = buildForwardHeaders(request);
  if (raw !== undefined && raw.length > 0) headers.set('content-type', 'application/json');

  try {
    const upstream = await send(
      upstreamUrl(path, request.nextUrl.search),
      {
        method: request.method,
        headers,
        ...(raw !== undefined && raw.length > 0 ? { body: raw } : {}),
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      },
      request.method,
    );
    return toNextResponse(upstream);
  } catch {
    return unavailable();
  }
}
