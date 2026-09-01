/**
 * Extracts the inline stylesheets from the 25 source pages, preserving every declaration
 * byte-for-byte and — just as importantly — the order they were written in.
 *
 * An earlier version split the CSS into a shared `base.css` plus a small per-page sheet.
 * That halved the bytes but reordered the cascade: a page rule always landed after every
 * shared rule, even where the source had a shared rule after it. On the home page that
 * inverted `.sect-head{align-items:flex-end}` and `.center{align-items:center}` and the
 * technology band stopped being centred — a real, visible regression caused purely by the
 * split. The first page-specific rule on every bespoke page turns out to be the very first
 * chunk in its stylesheet, so no amount of repair rules can recover the order; only keeping
 * a page's sheet whole can.
 *
 * So the split is now by page *family*, never inside one:
 *
 *   site.css       the complete stylesheet of a service page, in source order. All 17
 *                  service and solution pages share it, so it is fetched once and cached.
 *   solution.css   what all nine solution pages add on top, in source order.
 *   pageExtras     what a single service or solution page adds beyond that — the dating
 *                  page's colour treatment, the GEO page's hidden pricing band. Rendered in
 *                  that page's own <style>, because merging them repaints the other pages.
 *   <page>.css     the complete stylesheet of each of the seven bespoke pages.
 *
 * Splitting is by top-level chunk (a rule or an at-rule block) with brace counting, so
 * @media/@supports blocks stay intact — a naive split on "}" would shred them.
 */
const fs = require('fs');
const path = require('path');

const SRC = 'D:/Arpit/AptenTech';
const OUT = 'D:/Arpit/AptenTech/aptentech-platform/apps/web/src/styles';

/** Splits CSS into top-level chunks, tracking brace depth and skipping strings/comments. */
const { chunks } = require('./css-chunks');

function styleOf(file) {
  const html = fs.readFileSync(path.join(SRC, file), 'utf8');
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

/** A page's chunks in source order, with any exact repeat dropped. */
function ordered(file) {
  const out = [];
  const seen = new Set();
  for (const c of chunks(styleOf(file))) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).sort();
const byFile = {};
for (const f of files) byFile[f] = ordered(f);

const banner = (title, note) =>
  `/* ${'='.repeat(74)}\n   ${title}\n   ${note}\n\n   Generated from the original AptenTech HTML — every declaration is copied\n   verbatim, in the order the source wrote it. Do not restyle: the approved design\n   is locked and this file is what guarantees pixel parity.\n   Regenerate with scripts/extract-css.js.\n   ${'='.repeat(74)} */\n\n`;

const write = (name, title, note, list) => {
  fs.writeFileSync(path.join(OUT, name), banner(title, note) + list.join('\n') + '\n', 'utf8');
  return [name, list.length, Buffer.byteLength(list.join('\n'))];
};

fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ 1. site.css */
const REFERENCE = 'aptentech-seo.html';
const siteSheet = byFile[REFERENCE];
const siteSet = new Set(siteSheet);

const report = [
  write(
    'site.css',
    'SITE',
    'The complete stylesheet of a service page, in source order. Shared by all 17 service and solution pages.',
    siteSheet,
  ),
];

/* ------------------------------------------------------------------ 2. solution.css */
const SOLUTION_FILES = [
  'aptentech-taxi-app-development.html',
  'aptentech-food-delivery-app-development.html',
  'aptentech-fuel-delivery-app-development.html',
  'aptentech-alcohol-delivery-app-development.html',
  'aptentech-dating-app-development.html',
  'aptentech-fitness-app-development.html',
  'aptentech-music-app-development.html',
  'aptentech-video-streaming-app-development.html',
  'aptentech-travel-app-development.html',
];

const solutionCounts = new Map();
for (const f of SOLUTION_FILES) {
  for (const c of byFile[f]) {
    if (!siteSet.has(c)) solutionCounts.set(c, (solutionCounts.get(c) || 0) + 1);
  }
}

const solutionShared = byFile['aptentech-taxi-app-development.html'].filter(
  (c) => solutionCounts.get(c) === SOLUTION_FILES.length,
);

report.push(
  write(
    'solution.css',
    'SOLUTION EXTRAS',
    'Rules every one of the nine solution pages adds on top of site.css, in source order.',
    solutionShared,
  ),
);

/* ------------------------------------------------------------------ 3. per-page tails */
const SERVICE_PAGE_SLUGS = {
  'aptentech-ai-development.html': 'ai-development',
  'aptentech-software-development.html': 'software-development',
  'aptentech-web-development.html': 'web-development',
  'aptentech-mobile-app-development.html': 'mobile-app-development',
  'aptentech-digital-marketing.html': 'digital-marketing',
  'aptentech-seo.html': 'seo',
  'aptentech-ai-seo.html': 'ai-seo',
  'aptentech-generative-engine-optimization.html': 'generative-engine-optimization',
  'aptentech-taxi-app-development.html': 'taxi-app-development',
  'aptentech-food-delivery-app-development.html': 'food-delivery-app-development',
  'aptentech-fuel-delivery-app-development.html': 'fuel-delivery-app-development',
  'aptentech-alcohol-delivery-app-development.html': 'alcohol-delivery-app-development',
  'aptentech-dating-app-development.html': 'dating-app-development',
  'aptentech-fitness-app-development.html': 'fitness-app-development',
  'aptentech-music-app-development.html': 'music-app-development',
  'aptentech-video-streaming-app-development.html': 'video-streaming-app-development',
  'aptentech-travel-app-development.html': 'travel-app-development',
};

const shipped = new Set([...siteSet, ...solutionShared]);
const perPage = {};
for (const [file, slug] of Object.entries(SERVICE_PAGE_SLUGS)) {
  perPage[slug] = byFile[file].filter((c) => !shipped.has(c)).join('\n');
}

fs.writeFileSync(
  path.join(OUT, 'pageExtras.generated.ts'),
  [
    '/**',
    ' * Per-page CSS for the service and solution pages.',
    ' *',
    ' * Generated from the original HTML by scripts/extract-css.js — every declaration is the',
    " * source's, byte for byte. These are the rules a single page adds on top of the shared",
    " * template, and they stay per page: merged into one file, the dating page's colour",
    " * overrides repaint the other eight solution pages.",
    ' *',
    ' * Do not edit by hand. Regenerate with scripts/extract-css.js.',
    ' */',
    'export const PAGE_CSS: Record<string, string> = ' + JSON.stringify(perPage, null, 2) + ';',
    '',
  ].join('\n'),
  'utf8',
);

/* ------------------------------------------------------------------ 4. bespoke pages */
const BESPOKE = {
  'home.css': 'aptentech-homepage.html',
  'about.css': 'aptentech-about.html',
  'portfolio.css': 'aptentech-Portfolio.html',
  'blog.css': 'aptentech-blog.html',
  'blog-detail.css': 'aptentech-blog-detail.html',
  'contact.css': 'aptentech-contact.html',
  'legal.css': 'aptentech-privacy-policy.html',
};

for (const [out, file] of Object.entries(BESPOKE)) {
  report.push(
    write(out, out.replace('.css', '').toUpperCase(), `The complete stylesheet of ${file}, in source order.`, byFile[file]),
  );
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('pages read :', files.length);
for (const [name, count, bytes] of report) console.log(name.padEnd(20), ':', String(count).padStart(4), 'rules', kb(bytes));
for (const [slug, css] of Object.entries(perPage)) {
  if (css) console.log(('  page ' + slug).padEnd(20), ':', kb(Buffer.byteLength(css)));
}
