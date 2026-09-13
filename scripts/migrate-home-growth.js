#!/usr/bin/env node
/**
 * Brings the home page up to the revised design: the AI card grid becomes the growth-and-
 * marketing band, one service card is swapped, and three headings change.
 *
 * Everything it writes is read out of the approved source HTML rather than typed here, so the
 * copy and the icons are the designer's, not a transcription. The source is
 * `aptentech-homepage.html` beside the repository — the same file the seed reads.
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
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const SOURCE = process.env.SOURCE_HTML_DIR
  ? path.join(process.env.SOURCE_HTML_DIR, 'aptentech-homepage.html')
  : path.resolve(ROOT, '..', 'aptentech-homepage.html');
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

/*
  Hex to accent token.

  The design file sets colour by hex; the CMS stores a token from the closed palette instead,
  so an editor can only pick a brand colour. This is the same table `accentFromHex` uses in the
  shared package, repeated here because this script talks to MongoDB directly and does not load
  the workspace build.
*/
const ACCENT_FOR_HEX = {
  '#3A31DB': 'indigo',
  '#00C9A7': 'mint',
  '#7C4DFF': 'violet',
  '#FF9D2E': 'amber',
  '#14B8E4': 'cyan',
  '#F0468A': 'pink',
};

/** The seed's own key derivation. Kept identical so both produce the same key for one body. */
const iconKey = (body) => 'i' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 10);

const decode = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u2019/g, '’')
    .replace(/\\'/g, "'");

/**
 * Pulls one `var NAME = [ ... ];` array out of the source and evaluates it.
 *
 * The arrays are plain literals written by hand in the design file, so a JSON parse will not
 * take them (single quotes, HTML entities). Evaluating in a Function with no scope is enough
 * here because the input is a file from the repository, not anything a user supplies.
 */
function readArray(html, name) {
  const start = html.indexOf(`var ${name} = [`);
  if (start < 0) return null;
  const open = html.indexOf('[', start);

  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '[') depth += 1;
    else if (html[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        // eslint-disable-next-line no-new-func
        return Function(`"use strict"; return (${html.slice(open, i + 1)});`)();
      }
    }
  }
  return null;
}

/** The six-capability tab data, which is an array of objects rather than tuples. */
function readServices(html) {
  const start = html.indexOf('var SERVICES = [');
  if (start < 0) return null;
  const open = html.indexOf('[', start);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '[') depth += 1;
    else if (html[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        // eslint-disable-next-line no-new-func
        return Function(`"use strict"; return (${html.slice(open, i + 1)});`)();
      }
    }
  }
  return null;
}

/**
 * Splits the hero H1 into the three parts the renderer stores.
 *
 * The design prints one word group in the brand gradient, marked up as `<span class="g">`. The
 * CMS keeps that as `{ lead, highlight, trail }` rather than as markup, so an editor can
 * rewrite any of the three without being able to introduce a tag. Flattening the H1 to a single
 * string here would silently drop the gradient.
 */
function splitHeading(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!h1 || !h1[1]) return null;

  const inner = h1[1];
  const strip = (v) => decode(String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

  const span = inner.match(/<span class="g">([\s\S]*?)<\/span>/);
  if (!span || !span[1]) return { lead: strip(inner), highlight: '', trail: '' };

  const [before, after] = inner.split(span[0]);
  return { lead: strip(before), highlight: strip(span[1]), trail: strip(after) };
}

/** Text of the first element matching a very small subset of selectors. */
function textOf(html, pattern) {
  const m = html.match(pattern);
  return m && m[1] ? decode(m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()) : null;
}

(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source HTML not found: ${SOURCE}`);
    console.error('Set SOURCE_HTML_DIR if the approved pages live elsewhere.');
    process.exit(1);
  }

  const html = fs.readFileSync(SOURCE, 'utf8');

  const stages = readArray(html, 'GM_STAGES');
  const channels = readArray(html, 'GM_CHANNELS');
  const services = readServices(html);

  if (!stages || !channels || !services) {
    console.error('Could not read GM_STAGES, GM_CHANNELS and SERVICES from the source.');
    console.error('The source may be an older revision of the home page.');
    process.exit(1);
  }

  // ------------------------------------------------------------------ icons

  const needed = new Map();
  for (const c of channels) needed.set(iconKey(c[4]), c[4]);
  for (const s of services) if (s.icon) needed.set(iconKey(s.icon), s.icon);

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

  const growthSection = html.slice(html.indexOf('id="growth"'));
  const newHeadings = {
    hero: splitHeading(html),
    growthEyebrow: textOf(growthSection, /<span class="eyebrow[^"]*">([\s\S]*?)<\/span>/),
    growthTitle: textOf(growthSection, /<h2[^>]*id="ai-h2"[^>]*>([\s\S]*?)<\/h2>/),
    growthLede: textOf(growthSection, /<p class="lede[^"]*"[^>]*>([\s\S]*?)<\/p>/),
    funnelLabel: textOf(growthSection, /<p class="gm-k">([\s\S]*?)<\/p>/),
    growthCta: textOf(growthSection, /class="btn btn-mint gm-cta">([\s\S]*?)<svg/),
  };

  const changes = [];
  const blocks = home.blocks.map((block) => {
    if (block.type === 'aiGrid') {
      changes.push('aiGrid → growthBand');
      return {
        key: block.key,
        type: 'growthBand',
        enabled: block.enabled !== false,
        eyebrow: newHeadings.growthEyebrow ?? '',
        title: newHeadings.growthTitle ?? '',
        lede: newHeadings.growthLede ?? '',
        funnelLabel: newHeadings.funnelLabel ?? '',
        ctaLabel: newHeadings.growthCta ?? '',
        stages: stages.map((s) => ({ number: decode(s[0]), title: decode(s[1]), description: decode(s[2]) })),
        channels: channels.map((c) => ({
          // The source sets colour by hex; the CMS stores an accent token, so the hex is
          // matched back to the token the design already defines for it.
          accent: ACCENT_FOR_HEX[c[0]] ?? 'indigo',
          icon: iconKey(c[4]),
          title: decode(c[1]),
          description: decode(c[2]),
          outcome: decode(c[3]),
        })),
      };
    }

    if (block.type === 'serviceTabs') {
      /*
        The stored shape is the CMS's, not the design file's: the source calls the fields
        `desc`, `links` and `c`, while the block holds `description`, `bullets` and an accent
        token. Writing the source's names instead would leave a tab with no body text and an
        empty link list, and nothing would report it — the renderer reads what it knows about
        and ignores the rest.
      */
      const items = services.map((s) => ({
        accent: ACCENT_FOR_HEX[s.c] ?? 'indigo',
        title: decode(s.title),
        description: decode(s.desc),
        icon: iconKey(s.icon),
        bullets: (s.links ?? []).map(decode),
      }));
      const before = (block.items ?? []).map((i) => i.title).join('|');
      const after = items.map((i) => i.title).join('|');
      if (before !== after) changes.push(`serviceTabs items: ${services.length} capabilities`);

      const title = textOf(html, /<h2[^>]*id="svc-h2"[^>]*>([\s\S]*?)<\/h2>/);
      if (title && title !== block.title) changes.push(`serviceTabs title → "${title}"`);
      return { ...block, items, ...(title ? { title } : {}) };
    }

    if (block.type === 'homeHero' && newHeadings.hero) {
      const current = block.splitHeading ?? {};
      const next = newHeadings.hero;
      const same =
        current.lead === next.lead && current.highlight === next.highlight && current.trail === next.trail;
      if (!same) {
        changes.push(`homeHero heading → "${next.lead} [${next.highlight}]${next.trail ? ' ' + next.trail : ''}"`);
        return { ...block, splitHeading: next };
      }
    }

    if (block.type === 'whyGrid') {
      const title = textOf(html, /<h2[^>]*id="why-h2"[^>]*>([\s\S]*?)<\/h2>/);
      if (title && title !== block.title) {
        changes.push(`whyGrid title → "${title}"`);
        return { ...block, title };
      }
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
