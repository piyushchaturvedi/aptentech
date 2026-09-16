#!/usr/bin/env node
/**
 * Applies an extracted page document to its service/solution page.
 *
 * Text only. Accents and icons are read off the entry already in the database and put back
 * unchanged — the copy documents do not describe them, and choosing them here would quietly
 * redesign a page that was signed off.
 *
 * The mapping is written out per page rather than inferred from section names. The three
 * documents do not share a structure: one has an FAQ section and another does not, some
 * sections carry no `Section:` marker at all, and the order differs. A shared set of name
 * patterns would match the wrong section on one of them and put, say, a pricing table where the
 * features belong — silently, because every section is just a list of strings.
 *
 *   node scripts/apply-page-doc.js <slug>
 *   node scripts/apply-page-doc.js <slug> --apply
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const slug = process.argv[2];

if (!slug || slug.startsWith('--')) {
  console.error('Usage: node scripts/apply-page-doc.js <slug> [--apply]');
  process.exit(1);
}

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const ACCENTS = ['indigo', 'mint', 'violet', 'amber', 'cyan', 'pink'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The company figures, which are identical on every page and already verified on the home page.
 *
 * Taken from here rather than from the document: in two of the three the numbers sit in a Word
 * table, and a table's cells arrive concatenated with their neighbours — "Projects Delivered
 * 120+" as one string. Parsing that back apart would be guesswork about a number.
 */
const STATS = [
  { value: '250', suffix: '+', label: 'Projects Delivered' },
  { value: '120', suffix: '+', label: 'Global Clients' },
  { value: '5', suffix: '+', label: 'Years of Experience' },
  { value: '98', suffix: '%', label: 'Client Retention Rate' },
  { value: '60', suffix: '+', label: 'Countries Served' },
  { value: '150', suffix: '+', label: 'App Developers' },
];

/* ------------------------------------------------------------------ per-page mapping */

/**
 * Which section of each document feeds which part of the page.
 *
 * Addressed by position with the expected name beside it. The name is asserted rather than
 * searched for: if a document is re-exported and its sections move, this stops with a mismatch
 * instead of writing the wrong section into the wrong field.
 */
const MAPPINGS = {
  'music-app-development': {
    hero: [0, ''],
    protect: [1, 'How Do We Keep Your Music App Safe?'],
    valueProp: [2, 'All About Music Streaming App Development'],
    market: [3, 'Why Invest in Music Streaming Apps?'],
    stats: [4, 'Our Work in Numbers'],
    services: [5, 'Music App Development Services We Offer'],
    midCta: [6, 'CTA'],
    recognition: [7, 'Recognition & Awards'],
    solutions: [8, 'Music App Development Solutions We Offer'],
    cases: [9, 'Our Music App Development Solutions Portfolio'],
    testimonials: [10, 'What Our Clients Say'],
    features: [11, 'Our Music Streaming App Features'],
    technologies: [12, 'Future-Ready Technologies We Use for Our Music Streaming App Development'],
    midCta2: [13, 'CTA'],
    compliance: [14, 'Built on Trust: Compliance You Can Count On'],
    process: [15, 'Our Music Streaming App Development Process'],
    pricing: [16, 'Tailored Music App Development Cost'],
    techStack: [17, 'Tech Stack We Use for Music Streaming App Development'],
    why: [18, 'Why Businesses Trust AptenTech for Music App Development?'],
    faqs: [19, 'FAQs'],
  },
};

/* ------------------------------------------------------------------ shaping helpers */

const firstBody = (section) => section.items[0]?.body?.[0] ?? '';
const lede = (section) => section.lede.join(' ').trim();

/** A section whose items are alternating value and label — "USD 37.62 Billion", "Market Size". */
const pairs = (section) => {
  const out = [];
  for (let i = 0; i + 1 < section.items.length; i += 2) {
    out.push({ value: section.items[i].title, label: section.items[i + 1].title });
  }
  return out;
};

/**
 * A section Word recorded with no list markup at all, where a heading is followed by a fixed
 * number of its own points. Confirmed against the documents: every such block is one heading
 * and four points.
 */
const groupsOfFive = (section) => {
  const out = [];
  for (let i = 0; i < section.items.length; i += 5) {
    const block = section.items.slice(i, i + 5);
    if (!block.length) break;
    out.push({ title: block[0].title, bullets: block.slice(1).map((b) => b.title) });
  }
  return out;
};

/** Merges new text onto an existing list, keeping each entry's accent and icon. */
const merge = (existing, incoming, extra = () => ({})) => {
  const old = Array.isArray(existing) ? existing : [];
  return incoming.map((item, index) => {
    const from = old[index] ?? {};
    return {
      accent: from.accent ?? ACCENTS[index % ACCENTS.length],
      icon: from.icon ?? '',
      ...extra(index),
      ...item,
    };
  });
};

/* ------------------------------------------------------------------ run */

(async () => {
  const payloadFile = path.join(ROOT, 'scripts/data', `page-${slug}.json`);
  if (!fs.existsSync(payloadFile)) {
    console.error(`No extracted document for "${slug}".`);
    console.error(`Run: node scripts/extract-page-doc.js "<file.docx>" ${slug}`);
    process.exit(1);
  }

  const mapping = MAPPINGS[slug];
  if (!mapping) {
    console.error(`No mapping defined for "${slug}" in scripts/apply-page-doc.js.`);
    process.exit(1);
  }

  const { sections } = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));

  /** Resolves one mapped section, asserting the name still matches. */
  const at = (key) => {
    const [index, expected] = mapping[key];
    const section = sections[index];
    if (!section) throw new Error(`${key}: no section at index ${index}`);
    if (expected && section.name !== expected) {
      throw new Error(`${key}: expected section "${expected}" at ${index}, found "${section.name}"`);
    }
    return section;
  };

  const uri = envValue('MONGODB_URI');
  if (!uri) {
    console.error('MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(envValue('MONGODB_DB_NAME') || 'aptentech');

  const page = await db.collection('servicepages').findOne({ slug });
  if (!page) {
    console.error(`No service or solution page with slug "${slug}".`);
    await client.close();
    process.exit(1);
  }

  const hero = at('hero');
  const protect = at('protect');
  const valueProp = at('valueProp');
  const market = at('market');
  const stats = at('stats');
  const services = at('services');
  const midCta = at('midCta');
  const recognition = at('recognition');
  const solutions = at('solutions');
  const cases = at('cases');
  const testimonials = at('testimonials');
  const features = at('features');
  const technologies = at('technologies');
  const midCta2 = at('midCta2');
  const compliance = at('compliance');
  const process_ = at('process');
  const pricing = at('pricing');
  const techStack = at('techStack');
  const why = at('why');
  const faqs = at('faqs');

  const next = {
    heroTitle: hero.items[0]?.title ?? page.heroTitle,
    heroDescription: firstBody(hero),
    heroPoints: hero.items.slice(1).map((i) => i.title),

    protectTitle: protect.name,
    protect: merge(page.protect, protect.items.map((i) => ({ title: i.title, description: i.body.join(' ') }))),

    valuePropTitle: valueProp.name,
    valuePropBody: lede(valueProp),
    coreCapabilities: valueProp.items.map((i) => i.title),

    marketContextTitle: market.name,
    marketContextBody: lede(market),
    marketStats: pairs(market),

    statsTitle: stats.name,
    statsNote: lede(stats),
    stats: STATS,

    servicesTitle: services.name,
    services: merge(
      page.services,
      services.items.map((i) => ({ title: i.title, description: i.body.join(' '), bullets: i.bullets })),
    ),

    midCtaTitle: midCta.items[0]?.title ?? '',
    midCtaBody: firstBody(midCta),
    midCtaPoints: midCta.items.slice(1).map((i) => i.title),

    recognitionTitle: recognition.name,

    solutionsTitle: solutions.name,
    solutions: merge(
      page.solutions,
      groupsOfFive(solutions).map((g) => ({ title: g.title, bullets: g.bullets })),
      () => ({ featured: false }),
    ),

    caseStudiesTitle: cases.name,
    testimonialsTitle: testimonials.name,

    featuresTitle: features.name,
    features: merge(
      page.features,
      features.items.map((i) => ({ title: i.title, description: i.body.join(' '), items: i.bullets })),
    ),

    technologiesTitle: technologies.name,
    technologies: merge(
      page.technologies,
      technologies.items.map((i) => ({ title: i.title, description: i.body.join(' '), outcome: '' })),
    ),

    midCta2Title: midCta2.items[0]?.title ?? '',
    midCta2Body: firstBody(midCta2),

    complianceTitle: compliance.name,
    compliance: merge(page.compliance, compliance.items.map((i) => ({ label: i.title }))),

    processTitle: process_.name,
    process: process_.items.map((i) => ({
      title: i.title,
      description: i.body.join(' '),
      deliverables: i.bullets,
    })),

    pricingTitle: pricing.name,
    pricingBody: lede(pricing),

    techStackTitle: techStack.name,
    techStack: groupsOfFive(techStack).map((g, index) => {
      const from = (page.techStack ?? [])[index] ?? {};
      return {
        category: g.title,
        accent: from.accent ?? ACCENTS[index % ACCENTS.length],
        items: g.bullets.map((label, i) => {
          const chip = (from.items ?? [])[i] ?? {};
          return {
            label,
            icon: chip.icon ?? '',
            image: chip.image ?? { mediaId: null, legacyPath: null, alt: '', width: null, height: null },
          };
        }),
      };
    }),

    whyTitle: why.name,
    why: why.items.map((i) => ({ title: i.title, description: i.body.join(' ') })),

    faqTitle: faqs.name,
    faqs: faqs.items.map((i, index) => ({
      // The documents number their questions; the page numbers them itself.
      question: i.title.replace(/^\d+\.\s*/, ''),
      answer: i.body.join(' '),
      category: '',
      order: index,
      visible: true,
    })),
  };

  const changed = Object.keys(next).filter((k) => !same(page[k], next[k]));

  console.log(`${slug}\n`);
  for (const key of changed) {
    const value = next[key];
    const summary = Array.isArray(value) ? `${value.length} entries` : String(value).slice(0, 62);
    console.log(`  ${key.padEnd(22)} ${summary}`);
  }

  console.log(`\n${changed.length} field(s) ${APPLY ? 'updated' : 'would change'}`);

  if (APPLY && changed.length) {
    await db.collection('servicepages').updateOne({ _id: page._id }, { $set: next });
    console.log('Written.');
  } else if (!APPLY) {
    console.log(`\nDry run. To apply:\n  node scripts/apply-page-doc.js ${slug} --apply\n`);
  }

  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
