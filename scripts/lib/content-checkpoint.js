/**
 * Remembers which version of a copy payload was last written, so a deploy can apply new copy
 * without undoing an editor's work.
 *
 * The content scripts are not migrations. A migration changes the shape of data and is done
 * once the shape has changed; running it again finds nothing to do and never argues with
 * anybody. These scripts assert something stronger — that a page's copy equals the payload in
 * the repository — and that assertion is true right up until an admin edits the page. Run
 * unguarded on every deploy, they would quietly revert every CMS edit made since the last
 * release, which reads from the admin's side as the CMS losing their work.
 *
 * So the deploy does not ask "does the page match the payload?" — it asks "has the payload
 * changed since we last applied it?". A hash of the payload file answers that:
 *
 *   - new copy committed       -> hash differs -> applied once
 *   - admin edits the page     -> hash is the same -> deploy leaves it alone
 *   - new copy committed again -> hash differs -> applied again, which is the intent
 *
 * The checkpoint records only a hash and a timestamp. It is never the source of anything: if
 * the collection were dropped, the next deploy would re-apply every payload, which is exactly
 * the state a first deploy starts from.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');

const COLLECTION = 'contentcheckpoints';

/** The payload file's own bytes, hashed. Formatting changes count as changes, deliberately. */
function payloadHash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Whether this payload should be written.
 *
 * `force` is what the manual invocation uses: someone running the script by hand has decided
 * the payload is the truth, and should not have to edit a file to say so.
 */
async function shouldApply(db, key, hash, { force = false } = {}) {
  if (force) return { apply: true, reason: 'forced' };

  const seen = await db.collection(COLLECTION).findOne({ _id: key });
  if (!seen) return { apply: true, reason: 'never applied' };
  if (seen.hash !== hash) return { apply: true, reason: 'payload changed' };

  return { apply: false, reason: `payload unchanged since ${new Date(seen.appliedAt).toISOString().slice(0, 10)}` };
}

/** Records the version just written. Only ever called after a successful write. */
async function recordApplied(db, key, hash, payload) {
  await db
    .collection(COLLECTION)
    .updateOne({ _id: key }, { $set: { hash, payload, appliedAt: Date.now() } }, { upsert: true });
}

module.exports = { COLLECTION, payloadHash, shouldApply, recordApplied };
