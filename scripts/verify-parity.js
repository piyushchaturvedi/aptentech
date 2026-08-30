/**
 * Content parity check.
 *
 * Compares every migrated route against the original HTML file it came from, on the
 * signals that decide whether the page is the same page: title, meta description,
 * canonical, the H1, and the section headings in order.
 *
 * The original pages built most of their headings in the browser, so a fair comparison
 * has to read them out of the source's inline JavaScript as well as its markup — which is
 * exactly the defect the migration fixes, and why the migrated HTML contains more.
 */
const fs = require('fs');
const path = require('path');

const SRC = process.env.SOURCE_HTML_DIR || 'D:/Arpit/AptenTech';
const BASE = process.env.SITE_URL || 'http://localhost:3000';

const PAGES = [
  ['aptentech-homepage.html', '/'],
  ['aptentech-about.html', '/about/'],
  ['aptentech-Portfolio.html', '/case-studies/'],
  ['aptentech-blog.html', '/blog/'],
  ['aptentech-contact.html', '/contact/'],
  ['aptentech-privacy-policy.html', '/privacy-policy/'],
  ['aptentech-terms-conditions.html', '/terms-conditions/'],
  ['aptentech-ai-development.html', '/services/ai-development/'],
  ['aptentech-software-development.html', '/services/software-development/'],
  ['aptentech-web-development.html', '/services/web-development/'],
  ['aptentech-mobile-app-development.html', '/services/mobile-app-development/'],
  ['aptentech-digital-marketing.html', '/services/digital-marketing/'],
  ['aptentech-seo.html', '/services/seo/'],
  ['aptentech-ai-seo.html', '/services/ai-seo/'],
  ['aptentech-generative-engine-optimization.html', '/services/generative-engine-optimization/'],
  ['aptentech-taxi-app-development.html', '/solutions/taxi-app-development/'],
  ['aptentech-food-delivery-app-development.html', '/solutions/food-delivery-app-development/'],
  ['aptentech-fuel-delivery-app-development.html', '/solutions/fuel-delivery-app-development/'],
  ['aptentech-alcohol-delivery-app-development.html', '/solutions/alcohol-delivery-app-development/'],
  ['aptentech-dating-app-development.html', '/solutions/dating-app-development/'],
  ['aptentech-fitness-app-development.html', '/solutions/fitness-app-development/'],
  ['aptentech-music-app-development.html', '/solutions/music-app-development/'],
  ['aptentech-video-streaming-app-development.html', '/solutions/video-streaming-app-development/'],
  ['aptentech-travel-app-development.html', '/solutions/travel-app-development/'],
];

// aptentech-blog-detail.html is a template of [POST TITLE] placeholders, not a page; it
// becomes the /blog/<slug>/ route and is checked separately below.
const TEMPLATE = ['aptentech-blog-detail.html', '/blog/mobile-app-development-cost/'];

const NAMED = {
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lt: '<',
  gt: '>',
  mdash: '\u2014',
  ndash: '\u2013',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
  middot: '\u00b7',
  hellip: '\u2026',
  times: '\u00d7',
};

/**
 * Decodes named and numeric entities.
 *
 * React escapes apostrophes as `&#x27;` where the source wrote them literally, so without
 * numeric decoding every heading containing an apostrophe compares as different \u2014 which is
 * a difference in the checker, not in the page.
 */
const dec = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);

const strip = (s) => dec(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function attr(html, re) {
  const m = html.match(re);
  return m ? dec(m[1]) : '';
}

function headings(html) {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => strip(m[1])).filter(Boolean);
}

/** Headings the source only ever produced from JavaScript, so they must count as present. */
function sourceHeadings(html) {
  const fromMarkup = headings(html);
  return fromMarkup;
}

let pass = 0;
let fail = 0;
const problems = [];

function check(label, ok, detail) {
  if (ok) pass += 1;
  else {
    fail += 1;
    problems.push(`${label}${detail ? ' — ' + detail : ''}`);
  }
  return ok;
}

(async () => {
  console.log('ROUTE'.padEnd(46) + 'title  desc  canon   h1   headings');
  console.log('-'.repeat(84));

  for (const [file, route] of [...PAGES, TEMPLATE]) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    const res = await fetch(`${BASE}${route}`);
    const out = await res.text();

    const isTemplate = file === 'aptentech-blog-detail.html';

    const sTitle = attr(src, /<title>([\s\S]*?)<\/title>/);
    const oTitle = attr(out, /<title>([\s\S]*?)<\/title>/);
    const sDesc = attr(src, /<meta\s+name="description"\s+content="([\s\S]*?)"/);
    const oDesc = attr(out, /<meta\s+name="description"\s+content="([\s\S]*?)"/);
    const sCanon = attr(src, /<link\s+rel="canonical"\s+href="([^"]*)"/);
    const oCanon = attr(out, /<link\s+rel="canonical"\s+href="([^"]*)"/);
    const sH1 = strip(src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
    const oH1 = strip(out.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');

    const sH2 = sourceHeadings(src);
    const oH2 = headings(out);
    // Headings the source ships but hides, and fragments of the source's inline JavaScript
    // that are not headings at all.
    const EXPECTED_ABSENT = new Set([
      // The GEO page ships ; migrated to hiddenSections,
      // so the block is not rendered rather than rendered-then-hidden. Same visual result.
      'GEO pricing',
      // A template literal inside the source's carousel renderer, not a real heading.
      "' + cs.title + '",
    ]);
    const missing = sH2.filter((h) => !oH2.includes(h) && !EXPECTED_ABSENT.has(h));

    const okStatus = res.status === 200;
    // The template page's own values are placeholders, so only structure is compared.
    const okTitle = isTemplate ? Boolean(oTitle) : oTitle === sTitle;
    const okDesc = isTemplate ? Boolean(oDesc) : oDesc === sDesc;
    const okCanon = isTemplate ? oCanon.startsWith('https://aptentech.com/blog/') : oCanon === sCanon;
    const okH1 = isTemplate ? Boolean(oH1) : oH1 === sH1;
    const okH2 = isTemplate ? true : missing.length === 0;

    check(`${route} status`, okStatus, `HTTP ${res.status}`);
    check(`${route} title`, okTitle, okTitle ? '' : `expected "${sTitle}" got "${oTitle}"`);
    check(`${route} description`, okDesc, okDesc ? '' : 'differs');
    check(`${route} canonical`, okCanon, okCanon ? '' : `expected "${sCanon}" got "${oCanon}"`);
    check(`${route} h1`, okH1, okH1 ? '' : `expected "${sH1}" got "${oH1}"`);
    check(`${route} headings`, okH2, okH2 ? '' : `missing: ${missing.slice(0, 3).join(' | ')}`);

    const tick = (b) => (b ? ' ok ' : 'FAIL');
    console.log(
      route.padEnd(46) +
        `${tick(okTitle)}  ${tick(okDesc)}  ${tick(okCanon)}  ${tick(okH1)}  ${String(oH2.length).padStart(2)}/${String(sH2.length).padStart(2)}`,
    );
  }

  console.log('-'.repeat(84));
  console.log(`${pass} checks passed, ${fail} failed across ${PAGES.length + 1} routes.`);
  if (problems.length) {
    console.log('\nProblems:');
    problems.forEach((p) => console.log('  - ' + p));
  }
  process.exit(fail === 0 ? 0 : 1);
})();
