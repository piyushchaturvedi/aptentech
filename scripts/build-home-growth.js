#!/usr/bin/env node
/**
 * Extracts the home page's revised content from the approved design file into
 * `scripts/data/home-growth.json`, which `migrate-home-growth.js` then applies.
 *
 * Run this on a machine that has the design files; commit the JSON. The migration reads only
 * the JSON, because the design files sit beside the repository rather than inside it and a
 * server that has just a clone never sees them.
 *
 *   npm run build-home-growth
 *
 * Point it elsewhere with SOURCE_HTML_DIR if the approved pages are not in the repository's
 * parent directory.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = process.env.SOURCE_HTML_DIR
  ? path.join(process.env.SOURCE_HTML_DIR, 'aptentech-homepage.html')
  : path.resolve(ROOT, '..', 'aptentech-homepage.html');
const OUT = path.join(ROOT, 'scripts/data/home-growth.json');

/** Accent tokens the CMS stores, keyed by the hex the design file writes. */
const ACCENT = {
  '#3A31DB': 'indigo',
  '#00C9A7': 'mint',
  '#7C4DFF': 'violet',
  '#FF9D2E': 'amber',
  '#14B8E4': 'cyan',
  '#F0468A': 'pink',
};

/** The seed's key derivation, so both produce the same key for one SVG body. */
const iconKey = (body) => 'i' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 10);

const decode = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const strip = (v) => decode(String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

/**
 * Pulls one `var NAME = [ ... ];` literal out of the design file and evaluates it.
 *
 * These are hand-written JavaScript literals — single quotes, HTML entities — so JSON.parse
 * will not take them. Evaluating is acceptable here because the input is a file from this
 * repository's own working tree, not anything a user supplies.
 */
function readArray(html, name) {
  const marker = html.indexOf(`var ${name} = [`);
  if (marker < 0) return null;
  const open = html.indexOf('[', marker);

  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '[') depth += 1;
    else if (html[i] === ']') {
      depth -= 1;
      // eslint-disable-next-line no-new-func
      if (depth === 0) return Function(`"use strict"; return (${html.slice(open, i + 1)});`)();
    }
  }
  return null;
}

const text = (html, re) => {
  const m = html.match(re);
  return m && m[1] ? strip(m[1]) : '';
};

if (!fs.existsSync(SOURCE)) {
  console.error(`Design file not found: ${SOURCE}`);
  console.error('Set SOURCE_HTML_DIR if the approved pages live elsewhere.');
  process.exit(1);
}

const html = fs.readFileSync(SOURCE, 'utf8');

const stages = readArray(html, 'GM_STAGES');
const channels = readArray(html, 'GM_CHANNELS');
const services = readArray(html, 'SERVICES');

if (!stages || !channels || !services) {
  console.error('Could not read GM_STAGES, GM_CHANNELS and SERVICES.');
  console.error('This looks like a revision of the home page from before the growth section.');
  process.exit(1);
}

/*
  The hero prints one word group in the brand gradient. The CMS stores that as three parts
  rather than as markup, so an editor can rewrite any of them without introducing a tag —
  flattening the H1 to one string would silently drop the gradient.
*/
const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
const inner = h1 ? h1[1] : '';
const span = inner.match(/<span class="g">([\s\S]*?)<\/span>/);
const [beforeSpan, afterSpan] = span ? inner.split(span[0]) : [inner, ''];

const growthSection = html.slice(html.indexOf('id="growth"'));

const payload = {
  note: 'Generated from aptentech-homepage.html by `npm run build-home-growth`. Do not edit by hand.',
  hero: {
    lead: strip(beforeSpan),
    highlight: span ? strip(span[1]) : '',
    trail: strip(afterSpan),
  },
  whyTitle: text(html, /<h2[^>]*id="why-h2"[^>]*>([\s\S]*?)<\/h2>/),
  servicesTitle: text(html, /<h2[^>]*id="svc-h2"[^>]*>([\s\S]*?)<\/h2>/),
  growth: {
    eyebrow: text(growthSection, /<span class="eyebrow[^"]*">([\s\S]*?)<\/span>/),
    title: text(growthSection, /<h2[^>]*id="ai-h2"[^>]*>([\s\S]*?)<\/h2>/),
    lede: text(growthSection, /<p class="lede[^"]*"[^>]*>([\s\S]*?)<\/p>/),
    funnelLabel: text(growthSection, /<p class="gm-k">([\s\S]*?)<\/p>/),
    ctaLabel: text(growthSection, /class="btn btn-mint gm-cta">([\s\S]*?)<svg/),
    stages: stages.map((s) => ({ number: decode(s[0]), title: decode(s[1]), description: decode(s[2]) })),
    channels: channels.map((c) => ({
      accent: ACCENT[c[0]] ?? 'indigo',
      icon: iconKey(c[4]),
      title: decode(c[1]),
      description: decode(c[2]),
      outcome: decode(c[3]),
      // Carried so a checkout whose generated registry predates this section can add the
      // artwork. The migration strips it before writing to the database.
      iconBody: c[4],
    })),
  },
  services: services.map((s) => ({
    accent: ACCENT[s.c] ?? 'indigo',
    title: decode(s.title),
    description: decode(s.desc),
    icon: iconKey(s.icon),
    iconBody: s.icon,
    bullets: (s.links ?? []).map(decode),
  })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');

console.log(`wrote ${path.relative(ROOT, OUT)}`);
console.log(`  hero     : ${payload.hero.lead} [${payload.hero.highlight}]`);
console.log(`  stages   : ${payload.growth.stages.length}`);
console.log(`  channels : ${payload.growth.channels.length}`);
console.log(`  services : ${payload.services.map((s) => s.title).join(', ')}`);
