/**
 * Drops Next.js cache tags after a script has written content straight to MongoDB.
 *
 * Writing to the database directly skips the API, and the API is what normally tells the
 * renderer that a page it has cached is out of date. Without this the copy is in the database
 * and the site still serves the old page until its ISR interval expires an hour later, which
 * looks exactly like the script not having worked.
 *
 * Signed and timestamped the way the API signs it, because the endpoint verifies both a
 * matching HMAC and a timestamp inside five minutes.
 *
 * Failures are reported, never thrown. By the time this runs the content is already written,
 * and the page refreshes on its own interval regardless — a deploy must not fail because a
 * cache hint did not land.
 */
const crypto = require('node:crypto');

async function revalidate(tags, envValue) {
  if (!tags.length) return;

  const secret = envValue('REVALIDATE_SECRET');
  const url = envValue('REVALIDATE_URL') || 'http://localhost:3000/api/revalidate';

  if (!secret) {
    console.log('\nREVALIDATE_SECRET is not set, so the cache was not cleared.');
    console.log('The pages will pick the new copy up on their next hourly refresh.');
    return;
  }

  const body = JSON.stringify({ tags, at: Date.now() });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-signature': signature },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      console.log(`\nCache cleared for: ${tags.join(', ')}`);
    } else {
      console.log(`\nRevalidation returned ${res.status}. The pages will refresh on their next hourly interval.`);
    }
  } catch (error) {
    console.log(`\nCould not reach ${url} (${error.message}). The pages will refresh on their next hourly interval.`);
  }
}

module.exports = { revalidate };
