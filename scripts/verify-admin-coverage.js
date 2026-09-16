#!/usr/bin/env node
/**
 * Reports any block field on any site page that the admin renders no input for.
 *
 * The project's standing rule is that every piece of page content is editable from the admin.
 * A field can satisfy the schema, be stored, and render on the live page while the admin screen
 * has no input for it — which looks from the outside exactly like the content being missing.
 * This makes that gap visible instead of leaving it to be discovered on a page.
 *
 * The covered set is read out of the editor's own source rather than restated here, so the
 * audit cannot drift away from what the screen actually shows.
 *
 * Exits non-zero when anything is unreachable, so it can guard a release.
 *
 *   npm run verify-admin-coverage
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'apps/web/src/app/admin/pages/page.tsx'), 'utf8');

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

/** Fields the editor gates on individually. */
const covered = new Set([...admin.matchAll(/has\('([a-zA-Z]+)'\)/g)].map((m) => m[1]));

/** Fields it reaches through a list it loops over rather than a named check. */
for (const name of ['ICON_CARD_KEYS', 'PLAIN_TEXT_KEYS', 'LONG_TEXT_KEYS']) {
  const start = admin.indexOf(`const ${name} = [`);
  if (start < 0) continue;
  const open = admin.indexOf('[', start);
  const close = admin.indexOf(']', open);
  admin
    .slice(open + 1, close)
    .split(',')
    .map((entry) => entry.trim().replace(/['"]/g, ''))
    .filter(Boolean)
    .forEach((key) => covered.add(key));
}

/** Rendered unconditionally, or structural rather than content an editor would write. */
const always = new Set([
  'key',
  'type',
  'enabled',
  'eyebrow',
  'title',
  'body',
  'seo',
  'limit',
  'html',
  'emitSchema',
  'headingId',
  'paddingBlock',
  'centred',
  'formTitleTag',
]);

(async () => {
  const uri = envValue('MONGODB_URI');
  if (!uri) {
    console.error('MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(envValue('MONGODB_DB_NAME') || 'aptentech');

  let unreachable = 0;

  for (const page of await db.collection('sitepages').find({}).toArray()) {
    const detail = [];
    for (const block of page.blocks ?? []) {
      const missing = Object.keys(block).filter((key) => !covered.has(key) && !always.has(key));
      if (missing.length) {
        unreachable += missing.length;
        detail.push(`${block.type}: ${missing.join(', ')}`);
      }
    }
    console.log(page.slug.padEnd(19), detail.length ? detail.join(' | ') : 'all fields editable');
  }

  console.log('');
  console.log(`editor covers ${covered.size} distinct fields`);
  console.log(`unreachable fields across every site page: ${unreachable}`);

  await client.close();

  if (unreachable > 0) {
    console.log('\nEach one is page content an editor cannot change. Add an input for it in');
    console.log('apps/web/src/app/admin/pages/page.tsx, gated on `has(<field>)`.');
    process.exitCode = 1;
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
