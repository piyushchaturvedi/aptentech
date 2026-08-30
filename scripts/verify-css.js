/** Confirms every source page's CSS is fully covered by the stylesheets it will load. */
const fs = require('fs');
const path = require('path');

const SRC = 'D:/Arpit/AptenTech';
const OUT = 'D:/Arpit/AptenTech/aptentech-platform/apps/web/src/styles';

const { chunks } = require('./css-chunks');

const styleOf = (f) => (fs.readFileSync(path.join(SRC, f), 'utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/) || [, ''])[1];
const sheet = (f) => new Set(chunks(fs.readFileSync(path.join(OUT, f), 'utf8')));

const base = sheet('base.css');
const service = sheet('service.css');
const solution = sheet('solution.css');

// Which generated sheets each source page will load at runtime.
const LOADS = {
  'aptentech-homepage.html': ['base.css', 'home.css'],
  'aptentech-about.html': ['base.css', 'about.css'],
  'aptentech-Portfolio.html': ['base.css', 'portfolio.css'],
  'aptentech-blog.html': ['base.css', 'blog.css'],
  'aptentech-blog-detail.html': ['base.css', 'blog-detail.css'],
  'aptentech-contact.html': ['base.css', 'contact.css'],
  'aptentech-privacy-policy.html': ['base.css', 'legal.css'],
  'aptentech-terms-conditions.html': ['base.css', 'legal.css'],
};

const SERVICES = ['ai-development','ai-seo','digital-marketing','generative-engine-optimization','mobile-app-development','seo','software-development','web-development'];
const SOLUTIONS = ['alcohol-delivery-app-development','dating-app-development','fitness-app-development','food-delivery-app-development','fuel-delivery-app-development','music-app-development','taxi-app-development','travel-app-development','video-streaming-app-development'];

for (const s of SERVICES) LOADS[`aptentech-${s}.html`] = ['base.css', 'service.css'];
for (const s of SOLUTIONS) LOADS[`aptentech-${s}.html`] = ['base.css', 'service.css', 'solution.css'];

const cache = { 'base.css': base, 'service.css': service, 'solution.css': solution };
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
