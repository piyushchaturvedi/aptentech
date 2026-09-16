#!/usr/bin/env node
/**
 * Moves leads from a single `attachment` to an `attachments` array.
 *
 * The old field was declared but never written: the contact form's file input was never
 * wired to an upload, so every stored lead has it as null. That means this migration has
 * nothing real to carry across, and it exists anyway for two reasons — a document keeping a
 * field the schema no longer declares is a field nobody can see or remove, and a deploy that
 * ships the new code without it would leave the two shapes mixed with no record of which is
 * which.
 *
 * Idempotent: a second run reports 0. Safe to leave in the deploy permanently.
 *
 *   node scripts/migrate-lead-attachments.js
 *   node scripts/migrate-lead-attachments.js --apply
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

/* Resolved from the project rather than the working directory: Node looks for a module
   beside the script that requires it, so running this from elsewhere would not find the
   driver the API already depends on. */
const { MongoClient } = require(path.join(ROOT, 'node_modules/mongodb'));

function env(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

(async () => {
  const uri = env('MONGODB_URI') || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(env('MONGODB_DB_NAME') || 'aptentech');
  const leads = db.collection('leads');

  /*
    Anything that still has the old field, whatever its value.

    Not "where attachment is not null": a null is exactly what needs removing, and it is what
    every existing document holds. The filter is on the field's presence.
  */
  const pending = await leads.countDocuments({ attachment: { $exists: true } });

  /* A document that carried a real file would be worth converting rather than dropping.
     None should exist, so finding one is worth saying out loud before it is discarded. */
  const withFile = await leads.countDocuments({ attachment: { $ne: null, $exists: true } });
  if (withFile > 0) {
    console.log(`  note: ${withFile} lead(s) hold a non-null attachment. Listing them rather than guessing:`);
    for (const lead of await leads.find({ attachment: { $ne: null, $exists: true } }).limit(20).toArray()) {
      console.log(`    ${lead._id}  ${lead.email ?? '?'}  ${JSON.stringify(lead.attachment)}`);
    }
    console.log('    These were stored by a form that never uploaded files, so the reference points at nothing.');
  }

  // Leads that predate the array and never had the old field either.
  const missingArray = await leads.countDocuments({ attachments: { $exists: false } });

  console.log(`\nLeads carrying the old "attachment" field   ${pending}`);
  console.log(`Leads with no "attachments" array          ${missingArray}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.\n');
    await client.close();
    return;
  }

  /*
    Two writes rather than one, and deliberately so.

    Combining them would mean a single `$set: { attachments: [] }` whose filter has to be
    exactly right to avoid emptying an array that already holds files. Splitting removes the
    question: the second write can only touch documents where the field does not exist, so
    there is nothing there for it to overwrite.
  */
  const removed = await leads.updateMany({ attachment: { $exists: true } }, { $unset: { attachment: '' } });
  const defaulted = await leads.updateMany({ attachments: { $exists: false } }, { $set: { attachments: [] } });

  console.log(`\n${removed.modifiedCount} old field(s) removed, ${defaulted.modifiedCount} array(s) initialised.\n`);
  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
