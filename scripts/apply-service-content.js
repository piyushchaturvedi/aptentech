#!/usr/bin/env node
/**
 * Applies approved page copy from `scripts/data/pages/<slug>.json` to a service or solution
 * page.
 *
 * The payload carries **text only**. Accents, icons, images, media references, section order,
 * canvas banding, case-study and testimonial links and every other design or wiring decision
 * are read off the document that is already there and put back unchanged. The copy documents
 * do not describe any of that, and inventing it here would quietly redesign pages that were
 * signed off.
 *
 * Where new copy has more list entries than the page had, accents cycle through the palette
 * and the icon is left empty, which the design already renders as a plain mark. Where it has
 * fewer, the surplus entries are dropped — a list is replaced, not merged item by item, so a
 * shortened section does not leave an orphan behind.
 *
 * Safe to re-run: a second run finds every field already matching and reports nothing to do.
 *
 *   node scripts/apply-service-content.js                      # dry run, every payload
 *   node scripts/apply-service-content.js ai-seo               # dry run, one page
 *   node scripts/apply-service-content.js --apply              # write
 *   node scripts/apply-service-content.js --apply --force      # write even if unchanged
 *
 * A payload whose file has not changed since it was last written is skipped, so the deploy
 * can run this unattended without reverting edits an admin has since made in the CMS. See
 * scripts/lib/content-checkpoint.js. `--force` writes regardless, which is what someone
 * running it by hand usually means.
 */
const fs = require('node:fs');
const path = require('node:path');
const { payloadHash, shouldApply, recordApplied } = require('./lib/content-checkpoint');
const { revalidate } = require('./lib/revalidate');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'scripts/data/pages');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const ACCENTS = ['indigo', 'mint', 'violet', 'amber', 'cyan', 'pink'];

const EMPTY_MEDIA = { mediaId: null, legacyPath: null, alt: '', width: null, height: null };

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Which keys of a list entry belong to the design rather than to the copy.
 *
 * Entry *n* of the new list inherits these from entry *n* of the old list. Anything not named
 * here comes from the payload, so a field the copy owns can never be silently kept back.
 */
const DESIGN_KEYS = {
  protect: ['accent', 'icon'],
  services: ['accent', 'icon'],
  solutions: ['accent', 'icon', 'featured'],
  features: ['accent', 'icon'],
  technologies: ['accent', 'icon'],
  compliance: ['accent', 'icon'],
  awards: ['accent', 'icon'],
  leadReasons: ['accent', 'icon'],
  marketStats: ['accent'],
};

function mergeList(existing, incoming, designKeys) {
  const old = Array.isArray(existing) ? existing : [];
  return incoming.map((item, index) => {
    const from = old[index] ?? {};
    const kept = {};
    for (const key of designKeys) {
      if (from[key] !== undefined) kept[key] = from[key];
    }
    if (designKeys.includes('accent') && kept.accent === undefined) {
      kept.accent = ACCENTS[index % ACCENTS.length];
    }
    if (designKeys.includes('icon') && kept.icon === undefined) kept.icon = '';
    if (designKeys.includes('featured') && kept.featured === undefined) kept.featured = false;
    return { ...kept, ...item };
  });
}

/**
 * The tech-stack band, whose chips carry an optional icon and uploaded image per label.
 *
 * The payload gives each group a category and a list of plain labels. Chip *n* keeps whatever
 * icon or image chip *n* had, so a group whose labels are unchanged comes out byte-identical
 * and one that gained a label gets a plain chip rather than someone else's logo.
 */
function mergeTechStack(existing, incoming) {
  const old = Array.isArray(existing) ? existing : [];
  return incoming.map((group, index) => {
    const from = old[index] ?? {};
    return {
      category: group.category,
      accent: from.accent ?? ACCENTS[index % ACCENTS.length],
      items: group.items.map((label, i) => {
        const chip = (from.items ?? [])[i] ?? {};
        return { label, icon: chip.icon ?? '', image: chip.image ?? { ...EMPTY_MEDIA } };
      }),
    };
  });
}

/** The pricing table. Tier accents are design; the caption, headers, rows and factors are copy. */
function mergeCostTable(existing, incoming) {
  const from = existing ?? {};
  const oldRows = Array.isArray(from.rows) ? from.rows : [];
  return {
    ...from,
    ...incoming,
    rows: (incoming.rows ?? from.rows ?? []).map((row, index) => ({
      tierAccent: oldRows[index]?.tierAccent ?? ACCENTS[index % ACCENTS.length],
      ...row,
    })),
  };
}

/** FAQs are ordered and visible by position; the payload only carries question and answer. */
function mergeFaqs(existing, incoming) {
  const old = Array.isArray(existing) ? existing : [];
  return incoming.map((item, index) => ({
    question: item.question,
    answer: item.answer,
    category: item.category ?? old[index]?.category ?? '',
    order: index,
    visible: true,
  }));
}

/**
 * Builds the update for one page.
 *
 * Every payload key is applied as-is unless it is named above, so adding a plain string field
 * to a payload needs no change here. `sectionLedes` and `leadForm` are merged rather than
 * replaced, because each holds keys the copy documents do not mention.
 */
function buildUpdate(doc, copy) {
  const next = {};

  for (const [key, value] of Object.entries(copy)) {
    if (key.startsWith('_')) continue;

    if (DESIGN_KEYS[key]) {
      next[key] = mergeList(doc[key], value, DESIGN_KEYS[key]);
    } else if (key === 'techStack') {
      next[key] = mergeTechStack(doc[key], value);
    } else if (key === 'costTable') {
      next[key] = mergeCostTable(doc[key], value);
    } else if (key === 'faqs') {
      next[key] = mergeFaqs(doc[key], value);
    } else if (key === 'sectionLedes' || key === 'leadForm' || key === 'seo' || key === 'awardLead') {
      next[key] = { ...(doc[key] ?? {}), ...value };
    } else if (key === 'midCtaButton' || key === 'midCta2Button') {
      next[key] = { ...(doc[key] ?? { href: '#contact', style: 'primary' }), ...value };
    } else {
      next[key] = value;
    }
  }

  return next;
}

(async () => {
  if (!fs.existsSync(DATA)) {
    console.error(`No payload directory: ${DATA}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DATA)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !ONLY.length || ONLY.includes(path.basename(f, '.json')));

  if (!files.length) {
    console.error(ONLY.length ? `No payload for: ${ONLY.join(', ')}` : 'No payloads found.');
    process.exit(1);
  }

  const uri = envValue('MONGODB_URI');
  if (!uri) {
    console.error('MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(envValue('MONGODB_DB_NAME') || 'aptentech');
  const pages = db.collection('servicepages');

  let touched = 0;
  const changedTags = [];

  for (const file of files) {
    const slug = path.basename(file, '.json');
    const full = path.join(DATA, file);
    const copy = JSON.parse(fs.readFileSync(full, 'utf8'));
    const hash = payloadHash(full);

    // Asked before the page is even read: the question is whether this payload is new, not
    // whether the page happens to match it. A page that no longer matches because someone
    // edited it in the admin is the case this exists to leave alone.
    const verdict = await shouldApply(db, `page:${slug}`, hash, { force: FORCE });
    if (!verdict.apply) {
      console.log(`\n${slug}\n  skipped — ${verdict.reason}`);
      continue;
    }

    const doc = await pages.findOne({ slug });
    if (!doc) {
      console.log(`\n${slug}\n  SKIPPED — no page with this slug.`);
      continue;
    }

    const next = buildUpdate(doc, copy);
    const moved = Object.keys(next).filter((k) => !same(doc[k], next[k]));

    console.log(`\n${slug}  (${doc.kind})`);
    if (!moved.length) {
      console.log(`  already up to date (${verdict.reason})`);
      // The payload is new but the page already says the same thing — a comment or a note
      // changed, nothing else. Still recorded, so the next deploy does not ask again.
      if (APPLY) await recordApplied(db, `page:${slug}`, hash, file);
      continue;
    }

    touched += 1;
    for (const key of moved) {
      const before = Array.isArray(doc[key]) ? `${doc[key].length} entries` : 'text';
      const after = Array.isArray(next[key]) ? `${next[key].length} entries` : 'text';
      console.log(`  ${key}  ${before} -> ${after}`);
    }

    if (APPLY) {
      const update = {};
      for (const key of moved) update[key] = next[key];
      await pages.updateOne({ _id: doc._id }, { $set: update });
      console.log('  written');

      // Both the list tag and the page's own tag: a changed name or hero shows on the index
      // as well as on the page itself. The list tags are spelt out rather than derived from
      // the kind, because two of the four are not the kind plus an s.
      const LIST_TAG = { service: 'services', solution: 'solutions', industry: 'industries', technology: 'technologies' };
      const listTag = LIST_TAG[doc.kind];
      if (listTag) changedTags.push(listTag);
      changedTags.push(`${doc.kind}:${slug}`);

      await recordApplied(db, `page:${slug}`, hash, file);
    }
  }

  await client.close();

  if (APPLY && changedTags.length) await revalidate([...new Set(changedTags)], envValue);

  if (!touched) {
    console.log('\nEverything is already up to date.');
  } else if (!APPLY) {
    console.log(`\nDry run — ${touched} page(s) would change. To write:`);
    console.log('  node scripts/apply-service-content.js --apply\n');
  } else {
    console.log(`\n${touched} page(s) written.`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
