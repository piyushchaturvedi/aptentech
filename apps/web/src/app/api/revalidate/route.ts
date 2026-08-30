import crypto from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cache invalidation webhook.
 *
 * The Node API calls this after any content write, naming the cache tags that changed.
 * That is what lets an admin publish and see the change live in seconds without a
 * redeploy, while public pages otherwise stay served from cache and never touch MongoDB.
 *
 * The request is authenticated by an HMAC over the raw body. An unauthenticated
 * revalidation endpoint would let anyone drop the cache on demand and push load straight
 * through to the database, so the signature is checked before anything is invalidated.
 */

const SECRET = process.env.REVALIDATE_SECRET ?? '';

export async function POST(request: NextRequest) {
  if (!SECRET) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_CONFIGURED', message: 'Revalidation is not configured' } },
      { status: 503 },
    );
  }

  // The signature covers the exact bytes sent, so the body must be read as text first.
  const raw = await request.text();
  const provided = request.headers.get('x-revalidate-signature') ?? '';
  const expected = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Invalid signature' } },
      { status: 403 },
    );
  }

  let payload: { tags?: unknown; at?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'MALFORMED_JSON', message: 'Invalid payload' } },
      { status: 400 },
    );
  }

  // Reject stale signatures so a captured request cannot be replayed indefinitely.
  const at = typeof payload.at === 'number' ? payload.at : 0;
  if (!at || Math.abs(Date.now() - at) > 5 * 60 * 1000) {
    return NextResponse.json(
      { success: false, error: { code: 'EXPIRED', message: 'Request expired' } },
      { status: 400 },
    );
  }

  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length < 128).slice(0, 40)
    : [];

  for (const tag of tags) revalidateTag(tag);

  return NextResponse.json({ success: true, data: { revalidated: tags } });
}
