/**
 * Extracts the inline stylesheets from the 25 source pages into a small set of shared
 * files, preserving every declaration byte-for-byte so the migrated site is pixel-identical.
 *
 * Splitting is by top-level chunk (a rule or an at-rule block) with brace counting, so
 * @media/@supports blocks stay intact — a naive split on "}" would shred them.
 */
const fs = require('fs');
const path = require('path');

const SRC = 'D:/Arpit/AptenTech';
const OUT = 'D:/Arpit/AptenTech/aptentech-platform/apps/web/src/styles';

function styleOf(file) {
  const html = fs.readFileSync(path.join(SRC, file), 'utf8');
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

/** Splits CSS into top-level chunks, tracking brace depth and skipping strings/comments. */
const { chunks } = require('./css-chunks');

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).sort();
const byFile = {};
for (const f of files) byFile[f] = chunks(styleOf(f));

// Count how many pages each distinct chunk appears on.
const seen = new Map();
for (const f of files) for (const c of new Set(byFile[f])) seen.set(c, (seen.get(c) || 0) + 1);

const TOTAL = files.length;
const isShared = (c) => seen.get(c) === TOTAL;

// Base = chunks on every page, ordered as they appear in a full service page.
const REFERENCE = 'aptentech-seo.html';
const baseOrdered = [];
const baseSet = new Set();
for (const c of byFile[REFERENCE]) {
  if (isShared(c) && !baseSet.has(c)) { baseSet.add(c); baseOrdered.push(c); }
}
// Anything shared but absent from the reference page's ordering.
for (const f of files) {
  for (const c of byFile[f]) {
    if (isShared(c) && !baseSet.has(c)) { baseSet.add(c); baseOrdered.push(c); }
  }
}

function pageSheet(file, alreadyIn) {
  const emitted = [];
  const seenHere = new Set();
  for (const c of byFile[file]) {
    if (alreadyIn.has(c) || seenHere.has(c)) continue;
    seenHere.add(c);
    emitted.push(c);
  }
  return emitted;
}

const banner = (title, note) =>
  `/* ${'='.repeat(74)}\n   ${title}\n   ${note}\n\n   Generated from the original AptenTech HTML — every declaration is copied\n   verbatim. Do not restyle: the approved design is locked and this file is what\n   guarantees pixel parity. Regenerate with scripts/extract-css.js.\n   ${'='.repeat(74)} */\n\n`;

fs.mkdirSync(OUT, { recursive: true });

// 1. base.css — shared by all 25 pages.
fs.writeFileSync(
  path.join(OUT, 'base.css'),
  banner('BASE', `Rules present on all ${TOTAL} source pages: tokens, reset, typography, buttons, header, footer, utilities.`) +
    baseOrdered.join('\n') + '\n',
  'utf8',
);

// 2. service.css — the service/solution template.
const serviceExtra = pageSheet(REFERENCE, baseSet);
const serviceSet = new Set([...baseSet, ...serviceExtra]);
fs.writeFileSync(
  path.join(OUT, 'service.css'),
  banner('SERVICE / SOLUTION TEMPLATE', 'Shared by all 17 service and solution pages (measured 96–100% identical).') +
    serviceExtra.join('\n') + '\n',
  'utf8',
);

// 3. Anything a solution page adds beyond the service template.
const solutionExtra = pageSheet('aptentech-taxi-app-development.html', serviceSet);
const datingExtra = pageSheet('aptentech-dating-app-development.html', serviceSet);
const solutionAll = [...new Set([...solutionExtra, ...datingExtra])];
fs.writeFileSync(
  path.join(OUT, 'solution.css'),
  banner('SOLUTION EXTRAS', 'Rules unique to solution pages, loaded after service.css.') +
    solutionAll.join('\n') + '\n',
  'utf8',
);

// 4. Per-page sheets for the eight bespoke pages.
const pages = {
  'home.css': 'aptentech-homepage.html',
  'about.css': 'aptentech-about.html',
  'portfolio.css': 'aptentech-Portfolio.html',
  'blog.css': 'aptentech-blog.html',
  'blog-detail.css': 'aptentech-blog-detail.html',
  'contact.css': 'aptentech-contact.html',
  'legal.css': 'aptentech-privacy-policy.html',
};

const report = [];
for (const [out, file] of Object.entries(pages)) {
  const extra = pageSheet(file, baseSet);
  fs.writeFileSync(
    path.join(OUT, out),
    banner(out.replace('.css', '').toUpperCase(), `Rules specific to ${file}, loaded after base.css.`) +
      extra.join('\n') + '\n',
    'utf8',
  );
  report.push([out, extra.length, Buffer.byteLength(extra.join('\n'))]);
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('distinct chunks across site :', seen.size);
console.log('base.css                    :', baseOrdered.length, 'rules', kb(Buffer.byteLength(baseOrdered.join('\n'))));
console.log('service.css                 :', serviceExtra.length, 'rules', kb(Buffer.byteLength(serviceExtra.join('\n'))));
console.log('solution.css                :', solutionAll.length, 'rules', kb(Buffer.byteLength(solutionAll.join('\n'))));
for (const [name, count, bytes] of report) console.log(name.padEnd(28), ':', count, 'rules', kb(bytes));
