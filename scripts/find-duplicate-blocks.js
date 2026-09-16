#!/usr/bin/env node
/**
 * Finds — and optionally removes — blocks that appear more than once on a page.
 *
 * Re-running the content seed against a database that already has content can append a second
 * copy of a band instead of updating the first, which is how a page ends up printing the same
 * section twice. This repairs that without touching anything else.
 *
 * Two kinds are reported separately, because they carry different risk:
 *
 *   - **Identical** — same type and byte-for-byte the same content. One of them is certainly
 *     redundant, so `--apply` removes it.
 *   - **Similar** — same type and same heading, but the content has since diverged. Possibly a
 *     duplicate an editor has started rewriting, possibly two bands that genuinely share a
 *     heading. These are only listed; `--apply --include-similar` removes them, and you should
 *     read the report first.
 *
 * Which copy survives: the first one that is enabled, falling back to the first. Keeping a
 * disabled copy over an enabled one would silently remove the section from the live page.
 *
 *   node scripts/find-duplicate-blocks.js
 *   node scripts/find-duplicate-blocks.js --apply
 *   node scripts/find-duplicate-blocks.js --apply --include-similar
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const INCLUDE_SIMILAR = process.argv.includes('--include-similar');

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

/**
 * A stable fingerprint of a block's content.
 *
 * `key` and `enabled` are excluded on purpose: a duplicated block gets a fresh key, and one of
 * the pair is often switched off, so including either would make two obvious copies look
 * different. Object keys are sorted so a differently-ordered but identical block still matches.
 */
function fingerprint(block) {
  const sortDeep = (value) => {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((out, k) => {
          out[k] = sortDeep(value[k]);
          return out;
        }, {});
    }
    return value;
  };

  const { key, enabled, _id, ...content } = block;
  return crypto.createHash('sha1').update(JSON.stringify(sortDeep(content))).digest('hex');
}

const label = (block) => {
  const title = block.title || block.splitHeading?.lead || '';
  return title ? `${block.type} · "${String(title).slice(0, 48)}"` : block.type;
};

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

  const pages = await db.collection('sitepages').find({}).toArray();

  let identicalTotal = 0;
  let similarTotal = 0;
  let pagesChanged = 0;

  for (const page of pages) {
    const blocks = page.blocks ?? [];
    if (blocks.length < 2) continue;

    // Index every block by content, and separately by type+heading, recording positions.
    const byContent = new Map();
    const byHeading = new Map();

    blocks.forEach((block, index) => {
      const content = `${block.type}:${fingerprint(block)}`;
      if (!byContent.has(content)) byContent.set(content, []);
      byContent.get(content).push(index);

      const title = String(block.title ?? block.splitHeading?.lead ?? '').trim().toLowerCase();
      if (title) {
        const heading = `${block.type}:${title}`;
        if (!byHeading.has(heading)) byHeading.set(heading, []);
        byHeading.get(heading).push(index);
      }
    });

    /** Of a set of positions, the one to keep: the first enabled, else the first. */
    const keeper = (positions) => positions.find((i) => blocks[i].enabled !== false) ?? positions[0];

    const drop = new Set();
    const identical = [];
    const similar = [];

    for (const positions of byContent.values()) {
      if (positions.length < 2) continue;
      const keep = keeper(positions);
      identical.push({ positions, keep });
      for (const i of positions) if (i !== keep) drop.add(i);
    }

    for (const positions of byHeading.values()) {
      // Anything already caught as identical is not reported twice.
      const remaining = positions.filter((i) => !drop.has(i));
      if (remaining.length < 2) continue;
      const keep = keeper(remaining);
      similar.push({ positions: remaining, keep });
      if (INCLUDE_SIMILAR) for (const i of remaining) if (i !== keep) drop.add(i);
    }

    if (!identical.length && !similar.length) continue;

    console.log(`\n${page.slug}  (${blocks.length} blocks)`);

    for (const { positions, keep } of identical) {
      identicalTotal += positions.length - 1;
      console.log(`  identical ×${positions.length}  ${label(blocks[keep])}`);
      console.log(`    keeping position ${keep}, removing ${positions.filter((i) => i !== keep).join(', ')}`);
    }

    for (const { positions, keep } of similar) {
      similarTotal += positions.length - 1;
      console.log(`  similar   ×${positions.length}  ${label(blocks[keep])}`);
      console.log(
        `    same heading, different content — keeping ${keep}` +
          (INCLUDE_SIMILAR ? `, removing ${positions.filter((i) => i !== keep).join(', ')}` : ' (listed only)'),
      );
    }

    if (APPLY && drop.size) {
      const kept = blocks.filter((_, index) => !drop.has(index));
      await db.collection('sitepages').updateOne({ _id: page._id }, { $set: { blocks: kept } });
      pagesChanged += 1;
      console.log(`    written — ${blocks.length} → ${kept.length} blocks`);
    }
  }

  console.log('');
  console.log(`identical duplicates : ${identicalTotal}`);
  console.log(`similar (same heading): ${similarTotal}`);

  if (!identicalTotal && !similarTotal) {
    console.log('\nNothing to clean up.');
  } else if (APPLY) {
    console.log(`\nUpdated ${pagesChanged} page(s).`);
    if (similarTotal && !INCLUDE_SIMILAR) {
      console.log('The "similar" ones were left alone. Read them above, then:');
      console.log('  node scripts/find-duplicate-blocks.js --apply --include-similar');
    }
  } else {
    console.log('\nDry run — nothing was written. To remove the identical ones:');
    console.log('  node scripts/find-duplicate-blocks.js --apply\n');
  }

  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
