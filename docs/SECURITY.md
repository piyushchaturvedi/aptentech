# Security

Everything below was verified against the running system with
`node scripts/verify-security.js <admin-password>`, which issues real requests rather than
inspecting source. Latest run: **31 checks, 0 failures.** Re-run it after any change to
auth, validation or headers.

## The boundary

The API is the security boundary, not the frontend. Next.js middleware redirects
unauthenticated users for their benefit; it decides nothing. Every protected endpoint
independently verifies authentication, authorisation and input, so bypassing the admin UI
achieves nothing.

Roles come from the database record on every request, never from client input. Deactivating
a user takes effect on their next call because the account is re-read each time.

## Authentication

**Passwords** use Argon2id at OWASP-recommended parameters (19 MiB, t=2, p=1). Argon2id is
memory-hard, which makes large-scale offline cracking expensive in a way bcrypt's CPU-only
cost factor no longer is. The cost is encoded in the hash, so raising it later still
verifies existing passwords.

**Sessions are server-side records**, not JWTs. A stateless token cannot be revoked before
it expires; for a CMS where an account can delete content, immediate revocation on logout,
role change or suspected compromise matters more than avoiding a lookup. Only the SHA-256
of the session token is stored, so a database dump yields no usable sessions.

- 8-hour absolute lifetime, 30-minute idle timeout, both enforced server-side
- Cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, scoped to `/`
- Mongo expires session records itself via a TTL index — no cleanup job to forget
- Changing a password signs out every other device

**Account enumeration is closed.** A wrong password and an unknown address return the same
status and the same message, and a missing account still pays comparable hashing time so
the two cannot be told apart by latency either.

**Brute force**: per-IP *and* per-email rate limiting on sign-in (so password spraying
across accounts is limited too, not just repeated guesses at one), plus account lockout
after repeated failures.

**First-run safety**: `create-admin` generates a strong password, prints it once, and flags
the account `mustChangePassword`. Every admin route is refused until a new password is set.
An empty `ADMIN_PASSWORD` is treated as unset rather than accepted as a password — a bug
found and fixed during testing.

## CSRF

Double-submit token on every state-changing admin request. The CSRF token is returned in
the sign-in response body and held in memory by the admin UI — never in a cookie, never in
`localStorage`. A cross-site page can cause the browser to send the session cookie but
cannot read the token to match it.

`SameSite=Lax` already blocks cross-site form POSTs; the token is what makes this robust
rather than reliant on one browser behaviour.

## Injection

**NoSQL injection** is closed at two layers. Every query parameter is coerced to its
expected primitive by zod before it can reach a repository, and Mongoose's `sanitizeFilter`
is enabled globally as a backstop. Deliberate operators (`$in`, `$gte`, `$or`) are marked
with `mongoose.trusted()`, so the protection stays on rather than being switched off to get
legitimate queries working.

Verified: `?status[$ne]=NOTHING` is rejected with a 400 rather than returning everything.

**XSS**: React escapes by default. `dangerouslySetInnerHTML` appears in exactly three
places — blog article bodies, legal-page content, and the icon component. The first two are
sanitised server-side against a narrow allowlist on write *and* again on read, because
stored content is not assumed safe just because it was sanitised once. The icon component
reads from a registry that ships with the code and cannot be written to by an editor.

Verified: a lead containing `<script>alert(1)</script>` is stored verbatim as data and
rendered as text.

**IDOR**: every `:id` route validates the id shape before use. An unknown but well-formed id
returns 404; a malformed one returns 400. No route derives a permission from an id supplied
by the client.

## Uploads

Files travel Admin → API → storage, so the server sees the bytes before anything is written.

- **Magic-byte sniffing.** A `Content-Type` header and an extension are both attacker-
  controlled; the leading bytes decide the type. Verified: a PHP web shell named `shell.png`
  and declared `image/png` is rejected.
- **SVG is sanitised**, not merely accepted — `<script>`, `<foreignObject>`, `on*` handlers,
  `javascript:` URIs and entity declarations are stripped. Verified against an SVG carrying
  both a script tag and an `onload` handler.
- **Keys are server-generated UUIDs.** The user's filename is metadata only, so a crafted
  name cannot traverse paths or land as an executable-looking route.
- Size cap (10 MB), allowlisted types, and per-IP upload rate limiting.
- The bucket is private; objects are served through CloudFront with Origin Access Control.

## Lead spam protection

Layered and scored rather than binary, because a hard block on any single signal produces
false positives that cost real enquiries:

| Signal | Weight |
| --- | --- |
| Honeypot field filled | 100 (certain) |
| Submitted in under 1.5s | 40 |
| Disposable email domain | 35 |
| Three or more links | 35 |
| Missing user agent | 20 |

At 60 the lead is stored with status `SPAM` rather than discarded, so a false positive can
be recovered from the admin's SPAM filter. The response is identical either way — a bot
that can tell it was filtered simply adjusts until it gets through.

Also: per-IP rate limiting, a 10-minute duplicate window keyed on a hash of
name+email+message, request size caps, and strict server-side validation of every field.
Validation runs on both sides, and the API is the authority — a request that bypasses the
frontend entirely still cannot write a malformed lead.

## Privacy

The submitter's IP is stored as a salted HMAC, never in the clear — enough to rate-limit and
spot duplicates, not enough to retain as personal data. Only what the approved forms
actually ask for is collected. `company` exists in the model because it was specified but is
null, since no current form asks for it.

## Headers

Verified present on the running site:

| Header | Value |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (production only) |
| `X-Robots-Tag` on `/admin/*` | `noindex, nofollow, noarchive` |
| `X-Powered-By` | absent |

A **nonce-based CSP** without `unsafe-inline` for scripts is configured. This is only
practical because the migration moved every inline `<style>` and `<script>` out of the
markup — the source carried ~90 KB of inline CSS per page, which would have forced
`unsafe-inline` and gutted the policy. Roll it out in report-only mode first on a new
environment.

CORS is an allowlist of one origin. Requests with no `Origin` — server-to-server calls from
Next.js — are allowed, since CORS is a browser mechanism and blocking them would break the
site.

`trust proxy` is off by default and must be switched on only when actually behind a proxy.
Trusting `X-Forwarded-For` unconditionally lets any client spoof its IP and walk past every
per-IP rate limit.

## Error handling

One exit point for every error. Known errors carry a safe message written for a person;
everything else is logged in full server-side and returned as a generic `INTERNAL_ERROR`.
Stack traces, driver messages, duplicate-key details and file paths never cross the API
boundary. Verified: a 404 returns a clean envelope with no stack frames.

## Audit logging

Every admin mutation records who, what, which entity, the result and the source IP.
Passwords, tokens and secrets are never logged, and the logger redacts cookie and
authorization headers as a backstop. Entries expire after a year via a TTL index.

## Known gaps

Named rather than glossed over:

1. **Rate limiting is in-memory.** Correct for the single-instance deployment this is sized
   for. Running more than one API instance means moving the store to Redis or Mongo, or each
   instance enforces its own separate budget.
2. **No CAPTCHA.** Deliberate — it costs conversions. Add one only if real spam volume
   justifies it; the scoring system is the first line.
3. **No dependency scanning in CI.** `npm audit` should run on every build before this goes
   to production.
4. **CSP not yet exercised against a real browser session.** Verify in report-only mode on
   staging before enforcing.
5. **Two roles, not three.** `ADMIN` and `EDITOR` are implemented; `SUPER_ADMIN` exists in
   the enum and ranks highest but has no distinct permissions yet, because nothing currently
   needs separating.
