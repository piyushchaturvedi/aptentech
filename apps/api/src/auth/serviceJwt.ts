import crypto from 'node:crypto';
import {
  SERVICE_JWT_ALGORITHM,
  SERVICE_JWT_AUDIENCE,
  SERVICE_JWT_ISSUER,
  SERVICE_JWT_TTL_SECONDS,
} from '@aptentech/shared';
import { env } from '../config/env';

/**
 * Verifies the short-lived token the Next.js server sends.
 *
 * Returns a reason rather than throwing, so the caller can decide what to log and what to
 * tell the client — which are not the same thing. The client is told "invalid service
 * credentials" whatever went wrong; the log gets the specific reason, because "expired" and
 * "bad signature" call for completely different responses from whoever reads it.
 */

export type ServiceTokenResult = { ok: true; jti: string } | { ok: false; reason: string };

function fromBase64url(segment: string): Buffer {
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Constant-time comparison that does not leak length.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, and the obvious guard —
 * comparing lengths first and returning early — is itself a timing signal. Hashing both
 * sides makes them the same length whatever went in, so the comparison always runs.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verifyServiceToken(token: string): ServiceTokenResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'not a three-segment token' };

  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  let header: { alg?: unknown; typ?: unknown };
  let payload: { iss?: unknown; aud?: unknown; exp?: unknown; iat?: unknown; jti?: unknown };
  try {
    header = JSON.parse(fromBase64url(headerSegment).toString('utf8'));
    payload = JSON.parse(fromBase64url(payloadSegment).toString('utf8'));
  } catch {
    return { ok: false, reason: 'header or payload is not JSON' };
  }

  /*
    The algorithm is pinned, not read.

    This is the oldest hole in JWT verification: a library that takes `alg` from the token
    itself will happily accept `alg: "none"` with an empty signature, because the token asked
    it to. The header is compared against what we mint and anything else is refused before a
    single byte is verified.
  */
  if (header.alg !== SERVICE_JWT_ALGORITHM) {
    return { ok: false, reason: `unexpected alg: ${String(header.alg)}` };
  }

  /*
    Signature before claims.

    The claims come from the token, so until the signature checks out they are attacker-
    controlled text. Reading `exp` first would mean deciding whether to trust a token based on
    what that token says about itself.
  */
  const expected = crypto
    .createHmac('sha256', env.API_SERVICE_TOKEN)
    .update(`${headerSegment}.${payloadSegment}`)
    .digest();

  if (!safeEqual(fromBase64url(signatureSegment), expected)) {
    return { ok: false, reason: 'signature does not match' };
  }

  // Now the claims can be believed.
  if (payload.iss !== SERVICE_JWT_ISSUER) return { ok: false, reason: `wrong issuer: ${String(payload.iss)}` };
  if (payload.aud !== SERVICE_JWT_AUDIENCE) return { ok: false, reason: `wrong audience: ${String(payload.aud)}` };

  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return { ok: false, reason: 'expired' };
  }

  /*
    A token may not claim a longer life than we issue.

    Without this, anyone who obtained the signing key could mint themselves a decade-long
    token and the short lifetime would buy nothing. It does not defend against a stolen key —
    nothing here can — but it does mean the key is the only thing worth stealing, and that a
    token found in a log is worthless a minute later whatever its own `exp` says.

    Sixty seconds of slack on top, so a token minted a moment before a clock tick is not
    rejected for being one second too generous.
  */
  if (typeof payload.iat !== 'number' || payload.exp - payload.iat > SERVICE_JWT_TTL_SECONDS + 60) {
    return { ok: false, reason: 'lifetime longer than this service issues' };
  }

  // Not from the future by more than a moment: a wildly forward `iat` with a matching `exp`
  // would otherwise slip past the window check above.
  if (payload.iat > now + 60) return { ok: false, reason: 'issued in the future' };

  return { ok: true, jti: typeof payload.jti === 'string' ? payload.jti : '' };
}
