import crypto from 'node:crypto';
import {
  SERVICE_JWT_ALGORITHM,
  SERVICE_JWT_AUDIENCE,
  SERVICE_JWT_ISSUER,
  SERVICE_JWT_TTL_SECONDS,
} from '@aptentech/shared';

/**
 * Mints the short-lived token the API accepts.
 *
 * Server-side only, and only the callers in this directory import it. The key comes from a
 * variable with no NEXT_PUBLIC_ prefix, which is what stops Next.js inlining it into a
 * browser bundle; in a client component `SECRET` would be the empty string and every call
 * would be rejected rather than the key escaping.
 *
 * The `server-only` package would turn that into a build error instead of a runtime one and
 * is the better guarantee. It is not installed, and this is not the week to add a dependency
 * to the deploy for a guarantee the env-var naming already provides — worth adding the next
 * time package.json is touched for another reason.
 *
 * Written against node:crypto rather than a JWT library. What is needed here is one
 * algorithm, one signature and a base64url encoder; a dependency would add a supply-chain
 * surface to the thing that authenticates every call between our own two servers, which is
 * a poor trade for forty lines.
 */

const SECRET = process.env.API_SERVICE_TOKEN ?? '';

/**
 * base64url: base64 with the two URL-unsafe characters swapped and the padding removed.
 *
 * Not decoration — a JWT is three base64url segments joined by dots, and ordinary base64
 * produces `+`, `/` and `=`, none of which are legal in a JWT segment.
 */
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * A signed token, valid for the next minute.
 *
 * Minted per request rather than cached. Caching one for its lifetime would save a few
 * microseconds of HMAC and reintroduce exactly what this replaces: a value that is the same
 * across many requests and therefore worth stealing. An HMAC over a hundred bytes costs less
 * than the fetch it accompanies.
 */
export function mintServiceToken(): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: SERVICE_JWT_ALGORITHM, typ: 'JWT' };
  const payload = {
    iss: SERVICE_JWT_ISSUER,
    aud: SERVICE_JWT_AUDIENCE,
    iat: now,
    exp: now + SERVICE_JWT_TTL_SECONDS,
    // A unique id per token. Nothing consumes it today; it is what a replay cache would key
    // on if one is ever needed, and it costs sixteen bytes to make that possible later.
    jti: crypto.randomUUID(),
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(crypto.createHmac('sha256', SECRET).update(signingInput).digest());

  return `${signingInput}.${signature}`;
}

/**
 * The headers every call to the API carries.
 *
 * Both are sent during the changeover. The API accepts either, and logs when it falls back
 * to the static one — so the legacy header can be removed once those logs are silent, rather
 * than on a guess about which process restarted first.
 *
 * Sending both is what makes this deployable at all: the two applications reload seconds
 * apart, not atomically, and a version of the site that only sent the new header would get
 * 401 from every request for as long as the API was still the old build. Every page would
 * render empty.
 */
export function serviceAuthHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${mintServiceToken()}`,
    'x-api-key': SECRET,
  };
}
