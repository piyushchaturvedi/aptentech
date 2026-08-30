import { NextResponse, type NextRequest } from 'next/server';
import { leadSubmissionRefined } from '@aptentech/shared';

/**
 * Lead submission proxy.
 *
 * The browser posts here, same-origin, and this route calls the Node API server-side. That
 * indirection is deliberate:
 *
 *  - the API service token stays on the server and is never shipped to a client
 *  - the API is never exposed to the public internet
 *  - the visitor's real IP and user agent are attached here, where they cannot be forged
 *
 * Validation runs on both sides. This copy gives fast, useful field errors; the API
 * re-validates with the same schema and is the authority — a request that bypasses this
 * route entirely still cannot write a malformed lead.
 */

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1';
const SERVICE_TOKEN = process.env.API_SERVICE_TOKEN ?? '';

/** Header allowlist forwarded to the API. Anything else a client sends is ignored. */
const ATTRIBUTION_HEADERS = [
  'x-lead-utm-source',
  'x-lead-utm-medium',
  'x-lead-utm-campaign',
  'x-lead-utm-term',
  'x-lead-utm-content',
  'x-lead-referrer',
] as const;

const MAX_BODY_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  // Reject oversized bodies before parsing rather than after.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'That message is too long.' } },
      { status: 413 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'MALFORMED_JSON', message: 'Could not read that request.' } },
      { status: 400 },
    );
  }

  const parsed = leadSubmissionRefined.safeParse(payload);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields', details } },
      { status: 400 },
    );
  }

  const forwarded: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': SERVICE_TOKEN,
  };

  for (const header of ATTRIBUTION_HEADERS) {
    const value = request.headers.get(header);
    if (value) forwarded[header] = value.slice(0, 2048);
  }

  const userAgent = request.headers.get('user-agent');
  if (userAgent) forwarded['x-forwarded-user-agent'] = userAgent.slice(0, 400);

  // The visitor's address, taken from the platform rather than from the request body.
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? '';
  if (clientIp) forwarded['x-forwarded-for'] = clientIp;

  try {
    const res = await fetch(`${API_BASE}/leads`, {
      method: 'POST',
      headers: forwarded,
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      // Pass through the API's rate-limit and validation responses; mask anything else.
      if (res.status === 429 || res.status === 400) {
        return NextResponse.json(body ?? { success: false, error: { code: 'REJECTED', message: 'Please try again.' } }, {
          status: res.status,
        });
      }
      return NextResponse.json(
        { success: false, error: { code: 'SUBMIT_FAILED', message: 'We could not send that just now. Please try again.' } },
        { status: 502 },
      );
    }

    return NextResponse.json(body, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'SUBMIT_FAILED', message: 'We could not send that just now. Please try again.' } },
      { status: 502 },
    );
  }
}
