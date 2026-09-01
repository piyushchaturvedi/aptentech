/** Confirms every source page's CSS is fully covered by the stylesheets it will load. */
const fs = require('fs');
const path = require('path');

const SRC = 'D:/Arpit/AptenTech';
const OUT = 'D:/Arpit/AptenTech/aptentech-platform/apps/web/src/styles';

const { chunks } = require('./css-chunks');

const styleOf = (f) => (fs.readFileSync(path.join(SRC, f), 'utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/) || [, ''])[1];
const sheet = (f) => new Set(chunks(fs.readFileSync(path.join(OUT, f), 'utf8')));

const site = sheet('site.css');
const solution = sheet('solution.css');

/**
 * The per-page tails the service and solution routes render inline.
 *
 * Generated as a TypeScript module, so it is read as text and its chunks pulled out rather
 * than imported.
 */
const generated = fs.readFileSync(path.join(OUT, 'pageExtras.generated.ts'), 'utf8');
const PAGE_CSS = JSON.parse(generated.slice(generated.indexOf('{'), generated.lastIndexOf('}') + 1));
const pageTail = (slug) => new Set(chunks(PAGE_CSS[slug] ?? ''));

// Which generated sheets each source page will load at runtime.
const LOADS = {
  'aptentech-homepage.html': ['home.css'],
  'aptentech-about.html': ['about.css'],
  'aptentech-Portfolio.html': ['portfolio.css'],
  'aptentech-blog.html': ['blog.css'],
  'aptentech-blog-detail.html': ['blog-detail.css'],
  'aptentech-contact.html': ['contact.css'],
  'aptentech-privacy-policy.html': ['legal.css'],
  'aptentech-terms-conditions.html': ['legal.css'],
};

const SERVICES = ['ai-development','ai-seo','digital-marketing','generative-engine-optimization','mobile-app-development','seo','software-development','web-development'];
const SOLUTIONS = ['alcohol-delivery-app-development','dating-app-development','fitness-app-development','food-delivery-app-development','fuel-delivery-app-development','music-app-development','taxi-app-development','travel-app-development','video-streaming-app-development'];

for (const s of SERVICES) LOADS[`aptentech-${s}.html`] = ['site.css'];
for (const s of SOLUTIONS) LOADS[`aptentech-${s}.html`] = ['site.css', 'solution.css'];

const cache = { 'site.css': site, 'solution.css': solution };
const get = (name) => (cache[name] ??= sheet(name));

// Rules deliberately not carried into the stylesheets, with the reason.
const HANDLED_ELSEWHERE = new Map([
  ['#cost{display:none!important}', 'GEO page hides its pricing block; migrated to hiddenSections in the CMS'],
]);

let totalMissing = 0;
const rows = [];

for (const [file, sheets] of Object.entries(LOADS)) {
  const covered = new Set();
  for (const s of sheets) for (const c of get(s)) covered.add(c);
  // Plus whatever that page renders in its own <style>.
  const slug = file.replace('aptentech-', '').replace('.html', '');
  for (const c of pageTail(slug)) covered.add(c);

  const pageChunks = [...new Set(chunks(styleOf(file)))];
  const missing = pageChunks.filter((c) => !covered.has(c) && !HANDLED_ELSEWHERE.has(c));
  totalMissing += missing.length;
  rows.push([file.replace('aptentech-', '').replace('.html', ''), pageChunks.length, missing.length, missing.slice(0, 2)]);
}

console.log('PAGE'.padEnd(38) + 'rules  missing');
console.log('-'.repeat(60));
for (const [name, total, miss, sample] of rows) {
  console.log(name.padEnd(38) + String(total).padStart(5) + String(miss).padStart(9) + (miss ? '  e.g. ' + sample[0].slice(0, 60) : ''));
}
console.log('-'.repeat(60));
console.log(totalMissing === 0 ? 'PASS — every source rule is covered.' : `FAIL — ${totalMissing} rules would be lost.`);
