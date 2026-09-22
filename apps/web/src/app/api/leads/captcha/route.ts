import { NextResponse } from 'next/server';
import { serviceAuthHeaders } from '@/lib/api/serviceToken';

/**
 * Verification-question proxy.
 *
 * The enquiry forms ask for a challenge when they mount and again after a failed attempt.
 * They cannot call the API directly — it is not on the public internet and the service token
 * that opens it must stay on the server — so the request comes here first, exactly as lead
 * submission does.
 *
 * `force-dynamic` and `no-store` are both load-bearing. A challenge is single-use, so a
 * cached response would hand one visitor's question to the next visitor, whose answer would
 * then be rejected for a question nobody asked them. Next.js will happily cache a GET route
 * handler otherwise.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/captcha`, {
      headers: serviceAuthHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    const body = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown } | null;

    if (!res.ok || !body?.success) {
      console.error(`[captcha] API returned ${res.status} ${res.statusText}`);
      return NextResponse.json(
        { success: false, error: { code: 'CAPTCHA_UNAVAILABLE', message: 'Could not load the verification question.' } },
        { status: 502, headers: { 'cache-control': 'no-store' } },
      );
    }

    return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[captcha] Could not reach the API at ${API_BASE}/captcha — ${reason}`);

    return NextResponse.json(
      { success: false, error: { code: 'CAPTCHA_UNAVAILABLE', message: 'Could not load the verification question.' } },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}
