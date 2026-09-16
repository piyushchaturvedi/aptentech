#!/usr/bin/env node
/**
 * Brings the home page up to the revised design: the AI card grid becomes the growth-and-
 * marketing band, one service card is swapped, and three headings change.
 *
 * Reads `scripts/data/home-growth.json`, which is extracted from the approved source HTML by
 * `npm run build-home-growth` and committed. It deliberately does NOT read the HTML itself:
 * the design files live beside the repository rather than inside it, so a server that only has
 * a clone has no copy of them — the first version of this script read the HTML, found an older
 * revision on the server, and would have failed the whole deploy rather than updating anything.
 *
 * Two targets:
 *
 *   1. `iconRegistry.generated.ts` gains any icon the new section introduces. Keys are content
 *      hashes, exactly as the seed computes them, so re-running the seed later produces the
 *      same keys and nothing drifts.
 *   2. The home page's blocks in MongoDB. Only the affected blocks are touched; every other
 *      page, and every other block on this page, is left alone.
 *
 * Safe to re-run: a second run finds the work already done and reports nothing to do.
 *
 *   node scripts/migrate-home-growth.js
 *   node scripts/migrate-home-growth.js --apply
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const PAYLOAD = path.join(ROOT, 'scripts/data/home-growth.json');
const REGISTRY = path.join(ROOT, 'apps/web/src/components/shared/iconRegistry.generated.ts');

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

(async () => {
  if (!fs.existsSync(PAYLOAD)) {
    console.error(`Content payload not found: ${PAYLOAD}`);
    console.error('Regenerate it from the approved HTML with: npm run build-home-growth');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'));

  // ------------------------------------------------------------------ icons
  //
  // The payload carries each icon's SVG body alongside its key, so a checkout whose generated
  // registry predates this section can still resolve every icon. Anything already present is
  // left exactly as it is — the key is a hash of the body, so a match means identical artwork.

  const needed = new Map();
  for (const c of data.growth.channels) if (c.iconBody) needed.set(c.icon, c.iconBody);
  for (const s of data.services) if (s.iconBody) needed.set(s.icon, s.iconBody);

  let registry = fs.readFileSync(REGISTRY, 'utf8');
  const missing = [...needed].filter(([key]) => !registry.includes(`  ${key}:`));

  if (missing.length && APPLY) {
    const lines = missing.map(([key, body]) => `  ${key}: ${JSON.stringify(body)},`).join('\n');
    const close = registry.lastIndexOf('};');
    registry = registry.slice(0, close) + lines + '\n' + registry.slice(close);
    fs.writeFileSync(REGISTRY, registry);
  }

  console.log(`icons: ${needed.size} referenced, ${missing.length} ${APPLY ? 'added' : 'missing'}`);

  // ------------------------------------------------------------------ content

  const uri = envValue('MONGODB_URI');
  const dbName = envValue('MONGODB_DB_NAME') || 'aptentech';
  if (!uri) {
    console.error('MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(dbName);

  const home = await db.collection('sitepages').findOne({ slug: 'home' });
  if (!home) {
    console.error('No page with slug "home".');
    await client.close();
    process.exit(1);
  }

  // The stored blocks never carry `iconBody`; that field exists only so this script can repair
  // the registry. Stripping it keeps the database holding a key, never artwork.
  const strip = ({ iconBody, ...rest }) => rest;

  const changes = [];
  const blocks = home.blocks.map((block) => {
    if (block.type === 'aiGrid') {
      changes.push('aiGrid → growthBand');
      return {
        key: block.key,
        type: 'growthBand',
        enabled: block.enabled !== false,
        eyebrow: data.growth.eyebrow,
        title: data.growth.title,
        lede: data.growth.lede,
        funnelLabel: data.growth.funnelLabel,
        ctaLabel: data.growth.ctaLabel,
        stages: data.growth.stages,
        channels: data.growth.channels.map(strip),
      };
    }

    if (block.type === 'serviceTabs') {
      const items = data.services.map(strip);
      const next = { ...block, items, title: data.servicesTitle || block.title };
      if (!same(block.items, items)) changes.push(`serviceTabs items: ${items.length} capabilities`);
      if (next.title !== block.title) changes.push(`serviceTabs title → "${next.title}"`);
      return next;
    }

    if (block.type === 'homeHero' && !same(block.splitHeading, data.hero)) {
      changes.push(`homeHero heading → "${data.hero.lead} [${data.hero.highlight}]"`);
      return { ...block, splitHeading: data.hero };
    }

    if (block.type === 'whyGrid' && data.whyTitle && block.title !== data.whyTitle) {
      changes.push(`whyGrid title → "${data.whyTitle}"`);
      return { ...block, title: data.whyTitle };
    }

    return block;
  });

  if (!changes.length) {
    console.log('content: already up to date');
  } else {
    console.log('content:');
    for (const c of changes) console.log('  ' + c);
    if (APPLY) {
      await db.collection('sitepages').updateOne({ _id: home._id }, { $set: { blocks } });
      console.log('  written');
    }
  }

  if (!APPLY) console.log('\nDry run. Re-run with --apply to write.\n');

  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
