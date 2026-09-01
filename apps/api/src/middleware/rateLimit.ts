import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';

/**
 * Rate limits.
 *
 * These use the default in-memory store, which is correct for the single-instance
 * deployment this is sized for. Running more than one API instance means moving the store
 * to Redis or Mongo — otherwise each instance enforces its own separate budget, which is
 * the kind of thing that silently stops working after a scale-out.
 */

/**
 * Groups an IPv6 address by its /64 prefix.
 *
 * A single IPv6 client is routinely handed a whole /64, so limiting by the full address
 * lets one host rotate through billions of addresses and bypass the limit entirely.
 * IPv4 addresses are used as-is.
 */
function clientKey(req: Request): string {
  const ip = req.ip ?? '0.0.0.0';
  if (!ip.includes(':')) return ip;

  const normalised = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!normalised.includes(':')) return normalised;

  const groups = normalised.split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
}

const json = (code: string, message: string) => ({ success: false, error: { code, message } });

/**
 * Whether a request came from the site's own renderer.
 *
 * Compared by digest so the check takes the same time whatever the supplied value is; a
 * plain string comparison leaks the token a character at a time.
 */
function isTrustedService(req: Request): boolean {
  const provided = req.header('x-api-key') ?? '';
  if (!provided) return false;

  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(env.API_SERVICE_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Broad ceiling for the whole API. */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  /*
    The renderer is the only legitimate caller of the content API and it reads in bursts —
    a build pre-rendering every page and article makes hundreds of reads in seconds. The
    ceiling is aimed at the public internet, so it does not apply to that traffic. The
    limits that guard a specific action are mounted on those routes and still apply.
  */
  skip: isTrustedService,
  message: json('RATE_LIMITED', 'Too many requests. Please slow down.'),
});

/**
 * Lead submission. Tight enough to stop scripted flooding, loose enough that a genuine
 * visitor who submits, spots a typo and resubmits is never blocked.
 */
export const leadLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: json('RATE_LIMITED', 'You have sent several enquiries recently. Please try again shortly.'),
});

/**
 * Login. Counted per IP *and* per submitted email, so spraying one password across many
 * accounts is limited too — not just repeated guesses against a single account.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().slice(0, 200) : '';
    return `${clientKey(req)}|${email}`;
  },
  message: json('RATE_LIMITED', 'Too many sign-in attempts. Please wait a few minutes and try again.'),
});

/** Uploads are expensive; keep a modest ceiling even for authenticated admins. */
export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: json('RATE_LIMITED', 'Too many uploads. Please wait a moment.'),
});

/**
 * Inbound mail webhook.
 *
 * Generous, because a legitimate provider can deliver a burst after an outage and dropping
 * those means losing client replies. It is a ceiling against someone who has the shared
 * secret and is flooding, not a throttle on normal traffic.
 */
export const inboundLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: json('RATE_LIMITED', 'Too many inbound messages.'),
});

/** Replying sends real mail from the company's domain; a compromised session should not flood. */
export const replyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: json('RATE_LIMITED', 'Too many replies sent. Please wait a moment.'),
});
