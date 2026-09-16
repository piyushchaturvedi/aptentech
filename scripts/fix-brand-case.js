#!/usr/bin/env node
/**
 * Corrects the company name's capitalisation in stored content: "Aptentech" → "AptenTech".
 *
 * Two deliberate limits, because a blind find-and-replace across a database is how links break:
 *
 *   - **Identifier fields are never touched.** Slugs, hrefs, media keys, filenames, canonical
 *     URLs and email Message-IDs are addresses, not prose; changing the case of one silently
 *     breaks whatever points at it. (At the time of writing none of them contained the wrong
 *     spelling — this guard is here so that stays true if the data changes.)
 *
 *   - **Sent correspondence is left alone.** The `conversations` collection holds copies of
 *     messages that were actually delivered. Editing them would make the stored record differ
 *     from what the recipient received, which is worse than an inconsistent capitalisation.
 *
 * Only the exact wrong casing is replaced. An all-lowercase "aptentech" is left as it is: that
 * is how the domain and every slug are written.
 *
 *   node scripts/fix-brand-case.js
 *   node scripts/fix-brand-case.js --apply
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const WRONG = /Aptentech/g;
const RIGHT = 'AptenTech';

/** Field names whose value is an address or a key rather than something a reader sees. */
const IDENTIFIER =
  /^(slug|key|href|url|id|_id|mediaId|legacyPath|canonical|sourceKey|filename|categorySlug|messageId|inReplyTo|references|type|icon|accent|ogImage)$/;

/** Collections this will not rewrite, and why. */
const SKIP = new Map([['conversations', 'copies of messages that were already sent']]);

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

/** Rewrites display strings in place, counting what changed and what was deliberately skipped. */
function fix(node, key, tally) {
  if (typeof node === 'string') {
    if (!WRONG.test(node)) return node;
    WRONG.lastIndex = 0;
    if (IDENTIFIER.test(key)) {
      tally.skippedIdentifiers += 1;
      return node;
    }
    const next = node.replace(WRONG, RIGHT);
    tally.replacements += (node.match(WRONG) ?? []).length;
    WRONG.lastIndex = 0;
    return next;
  }
  if (Array.isArray(node)) return node.map((v) => fix(v, key, tally));
  if (node && typeof node === 'object' && node.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = fix(v, k, tally);
    return out;
  }
  // ObjectId, Date and anything else non-plain is returned untouched.
  return node;
}

(async () => {
  const uri = envValue('MONGODB_URI');
  if (!uri) {
    console.error('MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(envValue('MONGODB_DB_NAME') || 'aptentech');

  let grandReplacements = 0;
  let grandDocs = 0;
  let grandSkipped = 0;

  for (const { name } of await db.listCollections().toArray()) {
    if (SKIP.has(name)) {
      const docs = await db.collection(name).find({}).toArray();
      const hits = docs.filter((d) => JSON.stringify(d).includes('Aptentech')).length;
      if (hits) console.log(`${name.padEnd(17)} ${hits} doc(s) left alone — ${SKIP.get(name)}`);
      continue;
    }

    let docsChanged = 0;
    let replacements = 0;

    for (const doc of await db.collection(name).find({}).toArray()) {
      const tally = { replacements: 0, skippedIdentifiers: 0 };
      const { _id, ...rest } = doc;
      const next = fix(rest, '', tally);

      grandSkipped += tally.skippedIdentifiers;
      if (!tally.replacements) continue;

      docsChanged += 1;
      replacements += tally.replacements;
      if (APPLY) await db.collection(name).updateOne({ _id }, { $set: next });
    }

    if (docsChanged) {
      grandDocs += docsChanged;
      grandReplacements += replacements;
      console.log(`${name.padEnd(17)} ${docsChanged} doc(s), ${replacements} replacement(s)`);
    }
  }

  console.log('');
  console.log(`documents ${APPLY ? 'updated' : 'to update'}: ${grandDocs}`);
  console.log(`replacements: ${grandReplacements}`);
  if (grandSkipped) console.log(`identifier fields left alone: ${grandSkipped}`);

  if (!grandReplacements) console.log('\nNothing to correct.');
  else if (!APPLY) console.log('\nDry run — nothing was written. To apply:\n  node scripts/fix-brand-case.js --apply\n');

  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
