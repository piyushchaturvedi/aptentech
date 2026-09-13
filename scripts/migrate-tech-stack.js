#!/usr/bin/env node
/**
 * Converts stored tech-stack chips from strings to documents.
 *
 * The chips used to be `items: ["Swift", "Kotlin"]` and now carry an optional mark, so the
 * field is `items: [{ label, icon, image }]`. Mongoose cannot read the old shape into the new
 * one — a string where a subdocument is expected does not cast — so every page holding the old
 * shape has to be rewritten once.
 *
 * Safe to re-run: an entry already in the new shape is left exactly as it is, and nothing is
 * deleted. Run with no arguments to see what would change; add --apply to write.
 *
 *   node scripts/migrate-tech-stack.js
 *   node scripts/migrate-tech-stack.js --apply
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const EMPTY_MEDIA = { mediaId: null, legacyPath: null, alt: '', width: null, height: null };

(async () => {
  const uri = envValue('MONGODB_URI');
  const dbName = envValue('MONGODB_DB_NAME') || 'aptentech';
  if (!uri) {
    console.error('MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(dbName);

  // The driver is used rather than Mongoose on purpose: Mongoose would apply the new schema
  // while reading, which is the very thing that cannot handle the old shape.

  let changed = 0;
  let chips = 0;

  const upgradeGroups = (groups) =>
    (groups ?? []).map((group) => ({
      ...group,
      items: (group.items ?? []).map((item) => {
        if (typeof item !== 'string') return item;
        chips += 1;
        return { label: item, icon: '', image: { ...EMPTY_MEDIA } };
      }),
    }));

  // Service and solution pages hold the groups at the top level.
  for (const page of await db.collection('servicepages').find({ 'techStack.0': { $exists: true } }).toArray()) {
    const before = chips;
    const techStack = upgradeGroups(page.techStack);
    if (chips === before) continue;
    changed += 1;
    if (APPLY) await db.collection('servicepages').updateOne({ _id: page._id }, { $set: { techStack } });
  }

  /*
    Site pages hold them inside a block instead, under `groups`. Missing these was what broke
    the home page: the renderer is shared, so one unconverted block took the whole build down
    while every service page rendered correctly.
  */
  for (const page of await db.collection('sitepages').find({ 'blocks.groups.0': { $exists: true } }).toArray()) {
    const before = chips;
    const blocks = (page.blocks ?? []).map((block) =>
      Array.isArray(block.groups) ? { ...block, groups: upgradeGroups(block.groups) } : block,
    );
    if (chips === before) continue;
    changed += 1;
    if (APPLY) await db.collection('sitepages').updateOne({ _id: page._id }, { $set: { blocks } });
  }

  console.log(
    APPLY
      ? `Converted ${chips} chip(s) across ${changed} page(s).`
      : `${chips} chip(s) across ${changed} page(s) would be converted. Re-run with --apply to write.`,
  );

  if (!APPLY && changed > 0) console.log('\n  node scripts/migrate-tech-stack.js --apply\n');

  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
