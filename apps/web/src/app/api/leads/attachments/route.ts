import { NextResponse, type NextRequest } from 'next/server';
import { MAX_ATTACHMENT_BYTES } from '@aptentech/shared';
import { serviceAuthHeaders } from '@/lib/api/serviceToken';

/**
 * Attachment upload proxy.
 *
 * The same shape as the lead proxy beside it, and for the same reasons: the service token
 * stays on the server, the Node API is never reachable from a browser, and the visitor's
 * address is attached here where it cannot be forged.
 *
 * The form posts one file per request. That is what lets each file be reported as it lands
 * instead of the visitor watching a single bar for all of them, and it means one large file
 * failing does not take the others with it.
 *
 * The API re-checks everything that matters — the size, the actual bytes, the rate limit —
 * so nothing below is a security boundary. It is transport, plus a fast rejection of a body
 * that is obviously too large to be worth forwarding.
 */

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1';

/** Enough for a 10 MB file plus multipart framing on a small instance. */
export const maxDuration = 60;

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  /*
    Refuse an oversized body before reading it.

    `formData()` buffers the whole upload into memory, so checking afterwards means the cost
    has already been paid. The header is not trustworthy — a client can understate it — which
    is why the API enforces the real limit on the bytes it actually receives. This only stops
    the honest oversized upload, which is the common case.
  */
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_ATTACHMENT_BYTES + 64 * 1024) {
    return fail(413, 'FILE_TOO_LARGE', `Files must be under ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'MALFORMED_UPLOAD', 'That upload could not be read.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, 'NO_FILE', 'No file was uploaded.');
  if (file.size === 0) return fail(400, 'EMPTY_FILE', 'That file is empty.');

  // Rebuilt rather than forwarded, so the outgoing boundary matches the bytes actually sent.
  // Forwarding the original stream arrives truncated at the API — the same reason the media
  // upload route next door does this.
  const outgoing = new FormData();
  outgoing.append('file', file, file.name);

  const headers: Record<string, string> = { ...serviceAuthHeaders() };
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? '';
  if (clientIp) headers['x-forwarded-for'] = clientIp;

  try {
    const res = await fetch(`${API_BASE}/leads/attachments`, {
      method: 'POST',
      headers,
      body: outgoing,
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      /*
        The API's own refusals are passed through verbatim.

        Unlike a lead submission, where the backend's state is nobody's business, every one of
        these says something the person needs in order to succeed: the type is wrong, the file
        is too large, they have uploaded too many just now. Replacing them with "try again"
        would leave someone re-picking the same unsupported file.
      */
      if (res.status === 400 || res.status === 413 || res.status === 429) {
        return NextResponse.json(body ?? { success: false, error: { code: 'REJECTED', message: 'That file was refused.' } }, {
          status: res.status,
        });
      }

      console.error(
        `[attachments] API rejected an upload — ${res.status} ${res.statusText}: ` +
          `${JSON.stringify(body ?? {}).slice(0, 400)}`,
      );
      return fail(502, 'UPLOAD_FAILED', 'We could not store that file just now. Please try again.');
    }

    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[attachments] Could not reach the API at ${API_BASE}/leads/attachments — ${reason}`);
    return fail(502, 'UPLOAD_FAILED', 'We could not store that file just now. Please try again.');
  }
}
