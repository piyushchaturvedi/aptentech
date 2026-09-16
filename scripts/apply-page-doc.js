#!/usr/bin/env node
/**
 * Applies an extracted page document to its service or solution page.
 *
 * Two rules shape everything here.
 *
 * **Text only.** Accents and icons come off the entry already stored and go back unchanged. The
 * copy documents do not describe them, so choosing them here would redesign a page that was
 * signed off.
 *
 * **A field is written only when the document clearly says what belongs in it.** These
 * documents are not uniformly structured: some headings are merged into the paragraph that
 * explains them, some figures sit in a table whose cells arrive concatenated, and one section
 * per document carries no list markup at all. Where the source is ambiguous the existing page
 * content is left alone and the field is reported as skipped — a page keeping last week's
 * wording is a small problem, and a page printing a sentence fragment as a heading is not.
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
const EMPTY_MEDIA = { mediaId: null, legacyPath: null, alt: '', width: null, height: null };

/**
 * The company figures, identical on every page and already verified on the home page.
 *
 * Read from here rather than from the document: in each file these sit in a Word table, and a
 * table's cells arrive joined to their neighbours — "Projects Delivered 120+" as one string.
 * Splitting that back apart would be guessing at a number, which is the one thing not to guess.
 */
const STATS = [
  { value: '250', suffix: '+', label: 'Projects Delivered' },
  { value: '120', suffix: '+', label: 'Global Clients' },
  { value: '5', suffix: '+', label: 'Years of Experience' },
  { value: '98', suffix: '%', label: 'Client Retention Rate' },
  { value: '60', suffix: '+', label: 'Countries Served' },
  { value: '150', suffix: '+', label: 'App Developers' },
];

/* ------------------------------------------------------------------ mappings */

/**
 * Which section of each document feeds which part of the page, by position.
 *
 * Written out per page rather than matched by name. The three documents share neither their
 * section set nor their order — one has an FAQ section and another does not, and several
 * sections carry no `Section:` marker at all. A shared set of name patterns would match the
 * wrong section on one of them and write, say, pricing text into the features heading, without
 * anything looking wrong until someone read the page.
 *
 * A section named here is asserted by name as well as position, so a re-exported document that
 * has moved its sections stops with a mismatch instead of writing the wrong thing.
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
    technologies: [12, null],
    midCta2: [13, 'CTA'],
    compliance: [14, 'Built on Trust: Compliance You Can Count On'],
    process: [15, 'Our Music Streaming App Development Process'],
    pricing: [16, 'Tailored Music App Development Cost'],
    techStack: [17, null],
    why: [18, null],
    faqs: [19, 'FAQs'],
  },
  'fuel-delivery-app-development': {
    hero: [0, ''],
    protect: [1, 'How Do We Keep Your Fuel Delivery App Safe?'],
    valueProp: [2, 'All About Fuel Delivery App Development'],
    market: [3, 'Why Invest in Fuel Delivery Apps?'],
    stats: [4, 'Our Work in Numbers'],
    services: [5, 'Our Fuel Delivery App Development Services'],
    solutions: [7, null],
    cases: [8, 'Our Fuel Delivery App Portfolio'],
    testimonials: [9, 'What Our Clients Say'],
    features: [10, ''],
    technologies: [11, null],
    midCta2: [12, ''],
    compliance: [13, 'Built on Trust: Compliance You Can Count On'],
    process: [14, 'Our Fuel Delivery App Development Process'],
    pricing: [15, null],
    techStack: [16, ''],
    why: [17, null],
  },
  'dating-app-development': {
    hero: [0, ''],
    protect: [1, 'How Do We Protect Your Platform?'],
    valueProp: [2, null],
    market: [3, null],
    stats: [4, 'Our Work Portfolio'],
    services: [5, 'End-to-End Dating App Development Services'],
    midCta: [6, ''],
    recognition: [7, 'Recognition & Trust'],
    solutions: [8, 'Dating App Solutions We Provide'],
    cases: [9, 'Our Featured Dating App Success Stories'],
    testimonials: [10, 'Words From Our Happy Clients'],
    features: [11, 'Features to Have in Your Dating App'],
    technologies: [12, null],
    midCta2: [13, 'Want to Leverage AI in Your Dating App?'],
    compliance: [14, 'Dating App Compliance We Follow'],
    process: [15, 'Our Step-by-Step Dating App Development Process'],
    pricing: [16, 'How Much Does Dating App Development Cost?'],
    techStack: [17, null],
    why: [18, null],
    faqs: [19, 'FAQs'],
  },
};

/* ------------------------------------------------------------------ shaping */

/**
 * A section heading, trimmed of any sentence that ran into it.
 *
 * One document's marker reads "Why Invest in a Dating App? Dating apps have changed how people
 * meet…" — the heading and the paragraph below it were typed as one line. Cutting at the first
 * terminator recovers the heading; a name that is already short is returned untouched.
 */
const heading = (section) => {
  const name = (section.name ?? '').trim();
  if (name.length <= 80) return name;
  const cut = name.search(/[.?!]\s/);
  return cut > 0 ? name.slice(0, cut + 1).trim() : name;
};

const lede = (section) => section.lede.join(' ').trim();
const firstBody = (section) => section.items[0]?.body?.[0] ?? '';

/** Alternating value and label — "USD 37.62 Billion", "Market Size (2031)". */
const pairs = (section) => {
  if (section.items.length < 2 || section.items.length % 2 !== 0) return [];
  const out = [];
  for (let i = 0; i < section.items.length; i += 2) {
    out.push({ value: section.items[i].title, label: section.items[i + 1].title });
  }
  return out;
};

/**
 * A section's blocks of heading-plus-points, however that section happens to be written.
 *
 * Where Word recorded the points as a list they are already attached to their heading. Where it
 * recorded no structure at all — one section per document — the blocks are a repeating heading
 * and four points, confirmed against the source. A run that does not divide evenly is returned
 * empty rather than truncated, so a changed document fails visibly instead of losing entries.
 */
const blocks = (section) => {
  if (section.items.some((i) => i.bullets.length)) {
    return section.items.map((i) => ({ title: i.title, bullets: i.bullets, body: i.body.join(' ') }));
  }
  if (!section.items.length || section.items.length % 5 !== 0) return [];
  const out = [];
  for (let i = 0; i < section.items.length; i += 5) {
    const block = section.items.slice(i, i + 5);
    out.push({ title: block[0].title, bullets: block.slice(1).map((b) => b.title), body: '' });
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
    console.error(`No extracted document for "${slug}". Run scripts/extract-page-doc.js first.`);
    process.exit(1);
  }

  const mapping = MAPPINGS[slug];
  if (!mapping) {
    console.error(`No mapping for "${slug}" in scripts/apply-page-doc.js.`);
    process.exit(1);
  }

  const { sections } = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));

  /** The mapped section, or null when this document has no such section. */
  const at = (key) => {
    if (!mapping[key]) return null;
    const [index, expected] = mapping[key];
    const section = sections[index];
    if (!section) throw new Error(`${key}: no section at index ${index}`);
    if (expected && section.name !== expected) {
      throw new Error(`${key}: expected "${expected}" at ${index}, found "${section.name}"`);
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

  const next = {};
  const skipped = [];

  /** Writes a field only when the document actually produced something for it. */
  const put = (field, value, why) => {
    const usable = Array.isArray(value) ? value.length > 0 : Boolean(value && String(value).trim());
    if (usable) next[field] = value;
    else skipped.push(`${field} — ${why}`);
  };

  const hero = at('hero');
  if (hero) {
    put('heroTitle', hero.items[0]?.title ?? '', 'no heading in the opening section');
    put('heroDescription', firstBody(hero), 'no standfirst under the heading');
    put('heroPoints', hero.items[0]?.bullets ?? [], 'no tick points listed');
  }

  const protect = at('protect');
  if (protect) {
    put('protectTitle', heading(protect), 'section has no name');
    put(
      'protect',
      merge(page.protect, protect.items.filter((i) => i.body.length).map((i) => ({ title: i.title, description: i.body.join(' ') }))),
      'headings are merged into their descriptions in the document',
    );
  }

  const valueProp = at('valueProp');
  if (valueProp) {
    put('valuePropTitle', heading(valueProp), 'section has no name');
    put('valuePropBody', lede(valueProp), 'no introductory paragraph');
    put('coreCapabilities', valueProp.items[0]?.bullets ?? [], 'no capability list');
  }

  const market = at('market');
  if (market) {
    put('marketContextTitle', heading(market), 'section has no name');
    put('marketContextBody', lede(market), 'no introductory paragraph');
    put('marketStats', pairs(market), 'figures do not pair evenly into value and label');
  }

  const stats = at('stats');
  if (stats) {
    put('statsTitle', heading(stats), 'section has no name');
    put('statsNote', lede(stats), 'no introductory paragraph');
    next.stats = STATS;
  }

  const services = at('services');
  if (services) {
    put('servicesTitle', heading(services), 'section has no name');
    put(
      'services',
      merge(page.services, blocks(services).map((b) => ({ title: b.title, description: b.body, bullets: b.bullets }))),
      'could not separate service headings from their points',
    );
  }

  const midCta = at('midCta');
  if (midCta) {
    put('midCtaTitle', midCta.items[0]?.title ?? '', 'no heading');
    put('midCtaBody', firstBody(midCta), 'no body text');
    put('midCtaPoints', midCta.items[0]?.bullets ?? [], 'no points listed');
  }

  const recognition = at('recognition');
  if (recognition) put('recognitionTitle', heading(recognition), 'section has no name');

  const solutions = at('solutions');
  if (solutions) {
    put('solutionsTitle', heading(solutions), 'section has no name');
    put(
      'solutions',
      merge(page.solutions, blocks(solutions).map((b) => ({ title: b.title, bullets: b.bullets })), () => ({ featured: false })),
      'entries do not divide into heading-and-four-points blocks',
    );
  }

  const cases = at('cases');
  if (cases) put('caseStudiesTitle', heading(cases), 'section has no name');

  const testimonials = at('testimonials');
  if (testimonials) put('testimonialsTitle', heading(testimonials), 'section has no name');

  const features = at('features');
  if (features) {
    put('featuresTitle', heading(features), 'section has no name');
    put(
      'features',
      merge(page.features, blocks(features).map((b) => ({ title: b.title, description: b.body, items: b.bullets }))),
      'could not separate panel headings from their feature lists',
    );
  }

  const technologies = at('technologies');
  if (technologies) {
    put('technologiesTitle', heading(technologies), 'section has no name');
    put(
      'technologies',
      merge(page.technologies, technologies.items.filter((i) => i.body.length).map((i) => ({ title: i.title, description: i.body.join(' '), outcome: '' }))),
      'entries carry no descriptions',
    );
  }

  const midCta2 = at('midCta2');
  if (midCta2) {
    put('midCta2Title', midCta2.items[0]?.title ?? '', 'no heading');
    put('midCta2Body', firstBody(midCta2), 'no body text');
  }

  const compliance = at('compliance');
  if (compliance) {
    put('complianceTitle', heading(compliance), 'section has no name');
    put(
      'compliance',
      merge(page.compliance, compliance.items.map((i) => ({ label: i.title }))),
      'badge names are merged into their descriptions in the document',
    );
  }

  const process_ = at('process');
  if (process_) {
    put('processTitle', heading(process_), 'section has no name');
    put(
      'process',
      blocks(process_).map((b) => ({ title: b.title, description: b.body, deliverables: b.bullets })),
      'could not separate steps from their deliverables',
    );
  }

  const pricing = at('pricing');
  if (pricing) {
    put('pricingTitle', heading(pricing), 'section has no name');
    put('pricingBody', lede(pricing), 'no introductory paragraph');
  }

  const techStack = at('techStack');
  if (techStack) {
    put('techStackTitle', heading(techStack), 'section has no name');
    put(
      'techStack',
      blocks(techStack).map((b, index) => {
        const from = (page.techStack ?? [])[index] ?? {};
        return {
          category: b.title,
          accent: from.accent ?? ACCENTS[index % ACCENTS.length],
          items: b.bullets.map((label, i) => {
            const chip = (from.items ?? [])[i] ?? {};
            return { label, icon: chip.icon ?? '', image: chip.image ?? { ...EMPTY_MEDIA } };
          }),
        };
      }),
      'categories do not divide into heading-and-four-entries blocks',
    );
  }

  const why = at('why');
  if (why) {
    put('whyTitle', heading(why), 'section has no name');
    put(
      'why',
      why.items.filter((i) => i.body.length).map((i) => ({ title: i.title, description: i.body.join(' ') })),
      'reasons carry no descriptions',
    );
  }

  const faqs = at('faqs');
  if (faqs) {
    put('faqTitle', heading(faqs), 'section has no name');
    put(
      'faqs',
      faqs.items
        .filter((i) => i.body.length)
        .map((i, index) => ({
          // The documents number their questions; the page numbers them itself.
          question: i.title.replace(/^\d+\.\s*/, ''),
          answer: i.body.join(' '),
          category: '',
          order: index,
          visible: true,
        })),
      'questions carry no answers',
    );
  }

  const changed = Object.keys(next).filter((k) => !same(page[k], next[k]));
  for (const key of Object.keys(next)) if (!changed.includes(key)) delete next[key];

  console.log(`${slug}\n`);
  for (const key of changed) {
    const value = next[key];
    console.log(`  ${key.padEnd(22)} ${Array.isArray(value) ? `${value.length} entries` : String(value).slice(0, 58)}`);
  }

  if (skipped.length) {
    console.log('\n  left as it is on the page:');
    for (const s of skipped) console.log(`    ${s}`);
  }

  console.log(`\n${changed.length} field(s) ${APPLY ? 'updated' : 'would change'}, ${skipped.length} left alone`);

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
