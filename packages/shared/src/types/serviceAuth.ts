/**
 * The contract between the Next.js server and the Node API.
 *
 * Only the two halves' agreement lives here — the names, the algorithm and the lifetime. The
 * signing key is an environment variable on each server and appears nowhere in this package,
 * which is imported by code that is bundled for browsers.
 *
 * Nothing here is secret. A value that is safe to publish is exactly what belongs in a file
 * both sides read: the alternative is two copies of the same constant drifting apart, and a
 * mismatch here does not fail loudly — it makes every request from the site to its own API
 * return 401, which renders the whole site empty.
 */

/** Who mints these. Checked on verification so a token minted elsewhere does not pass. */
export const SERVICE_JWT_ISSUER = 'aptentech-web';

/** Who they are for. Stops a token meant for one service being replayed against another. */
export const SERVICE_JWT_AUDIENCE = 'aptentech-api';

/**
 * Sixty seconds.
 *
 * Both processes run on the same machine, so there is no clock skew to absorb and no reason
 * for a longer window. This number is the whole point of the change: the static key it
 * replaces was valid forever, so a single leaked request — a log line, a proxy capture, a
 * screenshot of a terminal — handed over permanent access to the content API and the lead
 * intake, with no way to revoke it short of redeploying both applications.
 *
 * A leaked token is now useless before anyone can read the log it leaked into.
 */
export const SERVICE_JWT_TTL_SECONDS = 60;

/**
 * HMAC-SHA256.
 *
 * Symmetric, because both sides are ours and both already hold the same secret. An
 * asymmetric algorithm would buy the ability to let someone verify without being able to
 * sign, which nothing here needs.
 *
 * The algorithm is pinned rather than read from the token's own header, which is where the
 * classic JWT vulnerability lives: a verifier that trusts `alg` accepts a token that says
 * `alg: none`, or one signed with the public key as an HMAC secret. The header is checked
 * against this constant and a mismatch is a rejection.
 */
export const SERVICE_JWT_ALGORITHM = 'HS256';

/** The header the token travels in. `x-api-key` is the legacy static path being retired. */
export const SERVICE_JWT_HEADER = 'authorization';
