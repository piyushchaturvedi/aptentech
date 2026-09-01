/**
 * Demo content for the placeholders the source shipped.
 *
 * The original HTML was written with 1,557 bracketed slots — `[VALUE]`, `[CLIENT NAME]`,
 * `[AWARD NAME]` — because the real values were never supplied. Left alone they appear on
 * the page verbatim, which is why the site reads as unfinished.
 *
 * Everything written here is **demo data in MongoDB**, not text in a component, so every
 * value is editable from the admin and none of it requires a code change to replace.
 *
 * ## What is filled in, and what deliberately is not
 *
 * Values that describe *how the site is configured* — addresses, phone numbers, mailboxes —
 * get obvious dummy values (`hello@example.com`, `+00 0000000000`). They are meant to be
 * replaced, and a plausible-looking fake would be worse than an obvious one because nobody
 * would notice it shipping.
 *
 * Values that would be *claims about the company* — awards, certifications, audit bodies,
 * partner tiers, review scores, client logos, company registration numbers — are filled with
 * visibly generic labels ("Demo award", "Demo certification body"). They are never given
 * realistic-sounding names. An invented "ISO 27001 certified" or "Deloitte Fast 50" would sit
 * on the page looking entirely credible, and that is precisely the kind of false claim this
 * project must not make, whatever the wording of the brief.
 *
 * Case-study metrics and testimonials are the same problem in a softer form: they are
 * presented as outcomes and quotes. They are filled so the design is complete, and every
 * seeded record carries `demoContent: true` so the admin can list exactly what still needs
 * replacing before launch.
 */
import {
  BlogPostModel,
  CaseStudyModel,
  FaqModel,
  ServicePageModel,
  SitePageModel,
  SiteSettingsModel,
  TestimonialModel,
} from '../models';
import { logger } from '../utils/logger';

/* ------------------------------------------------------------------ token map */

/**
 * Straight token substitutions.
 *
 * Applied to every string in every document. Tokens absent here are handled by a structured
 * pass below, because they need to vary per record rather than being one fixed value.
 */
const TOKENS: Readonly<Record<string, string>> = {
  /* --- contact and configuration: obvious dummies, meant to be noticed and replaced --- */
  '[EMAIL ADDRESS]': 'hello@example.com',
  '[SALES EMAIL]': 'sales@example.com',
  '[CAREERS EMAIL]': 'careers@example.com',
  '[PARTNERSHIPS EMAIL]': 'partnerships@example.com',
  '[GRIEVANCE EMAIL]': 'grievance@example.com',
  '[PRIVACY EMAIL]': 'privacy@example.com',
  '[LEGAL EMAIL]': 'legal@example.com',
  '[PHONE NUMBER]': '+00 0000000000',
  '[PHONE]': '+00 0000000000',
  '[OFFICE ADDRESS LINE 1]': 'Demo Street 1',
  '[ADDRESS LINE 1]': 'Demo Street 1',
  '[ADDRESS LINE 2]': 'Demo District',
  '[POSTCODE]': '000000',
  '[CITY]': 'Demo City',
  '[REGION]': 'Demo Region',
  '[TIME ZONE]': 'UTC+00:00',
  '[DAYS]': 'Monday to Friday',
  '[HOURS]': '09:00–18:00',
  '[OFFICE LOCATIONS]': 'Demo City',
  '[CITY, COUNTRY]': 'Demo City, Demo Country',
  '[CITY, STATE, PIN]': 'Demo City, Demo State, 000000',
  '[N]': '—',

  /* --- legal identity: never invented, because these are matters of public record --- */
  '[APTENTECH LEGAL ENTITY NAME]': 'AptenTech (demo entity name — replace before launch)',
  '[REGISTERED OFFICE ADDRESS]': 'Demo Street 1, Demo City, 000000',
  '[CIN NUMBER]': 'DEMO-CIN-0000000',
  '[GSTIN]': 'DEMO-GSTIN-0000',
  '[GRIEVANCE OFFICER NAME]': 'Demo Officer',
  '[DESIGNATION]': 'Grievance Officer',

  /*
    Recognition, compliance and partnerships.

    Kept visibly generic on purpose. A realistic name here would read as a genuine credential
    to every visitor, and neither the brief nor the source content establishes that AptenTech
    holds any of them.
  */
  '[AWARD NAME]': 'Demo award',
  '[CERTIFICATION NAME]': 'Demo certification',
  '[COMPLIANCE STANDARD]': 'Demo standard',
  '[ISSUING BODY]': 'Demo issuing body',
  '[AUDITOR]': 'Demo auditor',
  '[SCOPE]': 'demo scope',
  '[PARTNERSHIP TIER]': 'Demo tier',
  '[CLOUD / IOT PARTNER]': 'Demo cloud partner',
  '[CLOUD / AI PARTNER]': 'Demo cloud partner',
  '[CLOUD / CDN PARTNER]': 'Demo CDN partner',
  '[CLOUD PARTNER]': 'Demo cloud partner',
  '[REVIEW PLATFORM]': 'Demo review platform',
  '[RATING]': '—',
  '[INDUSTRY LISTING]': 'Demo listing',
  '[DIRECTORY]': 'Demo directory',
  '[CATEGORY]': 'Demo category',
  '[YEAR]': '2025',

  /* --- client and partner logo slots --- */
  '[CLIENT LOGO 01]': 'Demo client 1',
  '[CLIENT LOGO 02]': 'Demo client 2',
  '[CLIENT LOGO 03]': 'Demo client 3',
  '[CLIENT LOGO 04]': 'Demo client 4',
  '[CLIENT LOGO 05]': 'Demo client 5',
  '[CLIENT LOGO 06]': 'Demo client 6',
  '[PARTNER LOGO 01]': 'Demo partner 1',
  '[PARTNER LOGO 02]': 'Demo partner 2',

  /*
    Market figures.

    A market size or growth rate is a citable statistic, and inventing one attributes a claim
    to research that does not exist. Rendered as a dash so the layout holds without asserting
    a number.
  */
  '[MARKET SIZE]': '—',
  '[PROJECTION]': '—',
  '[CAGR]': '—',
  '[STAT VALUE]': '—',
  '[SUBSCRIBERS]': '—',
  '[USERS]': '—',
  '[NUMBER]': '—',
  '[RATE]': '—',

  /* --- editorial --- */
  '[AUTHOR NAME]': 'AptenTech Engineering',
  '[AUTHOR ROLE]': 'Engineering team',
  '[SLA TIERS]': 'standard and priority',
  '[COST RANGE]': 'Available on request',
};

/** Applied after the token map, for slots written as a sentence rather than a token. */
const PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\[MEASURABLE BUSINESS RESULT[^\]]*\]/g,
    'Demo result — replace with a verified figure before launch.',
  ],
  [
    /\[TESTIMONIAL[^\]]*\]/g,
    'Demo testimonial. Replace this with a real client quote from the admin before launch.',
  ],
  [/\[SECTION IMAGE\]/g, 'Section image'],
  [/\[CTA IMAGE\]/g, 'Call-to-action image'],
  [/\[FEATURED IMAGE\]/g, 'Featured image'],
  [/\[DATE\]/g, 'Recently'],
];

/* ------------------------------------------------------------------ case studies */

/**
 * A demo product name per case study.
 *
 * Named by what the study is about, so the portfolio reads coherently. All fictional — the
 * brief asks for exactly this, and none is presented as a real company that hired AptenTech.
 */
const PROJECT_NAMES: Readonly<Record<string, string>> = {
  Dating: 'MatchPoint', Social: 'CircleUp', 'Video dating': 'FaceTime Match', Matrimonial: 'BondWell',
  'Music streaming': 'SoundDrift', Discovery: 'TuneFind', 'Live audio': 'AirWave', 'Artist tools': 'StudioKit',
  'Video streaming': 'StreamBox', 'OTT platform': 'StreamBox', 'Live events': 'LiveCast',
  'Creator platform': 'CreatorHub', 'Media & entertainment': 'MediaOne',
  'Fuel delivery': 'FuelRun', 'On-demand fuel': 'FuelRun', 'Fleet fuelling': 'FleetFuel', 'Tank monitoring': 'TankSense',
  Fitness: 'FitTrack', 'Fitness & coaching': 'FitTrack', 'Wearable integration': 'PulseSync',
  'Corporate wellness': 'WellWorks', 'AI coaching': 'CoachAI',
  Travel: 'TravelMate', Airline: 'SkyRoute', Hospitality: 'StayWell', 'Ground transport': 'GroundLink',
  'Tour operator': 'TourCraft',
  'Food delivery': 'FoodFlow', Marketplace: 'MarketLink', 'Restaurant chain': 'DineChain',
  'Cloud kitchen': 'KitchenOne', 'Grocery delivery': 'FreshCart',
  'Ride-hailing': 'RideGo', 'Taxi fleet': 'FleetGo', 'Airport transfers': 'TransferOne',
  'Corporate transport': 'CommuteCo',
  'Alcohol marketplace': 'CellarDoor', 'Liquor retail chain': 'BottleShop',
  'Multi-region operator': 'RegionPour', 'Winery DTC': 'VineDirect',
  AI: 'InsightAI', 'Enterprise support': 'SupportAI', Manufacturing: 'FactoryVision',
  'Financial services': 'LedgerCore', Insurance: 'ClaimFlow',
  'Enterprise operations': 'OpsCentre', SaaS: 'PlatformOne', 'B2B SaaS': 'PlatformOne',
  Logistics: 'RouteWise', Ecommerce: 'ShopStream', 'E-commerce': 'ShopStream',
  'D2C ecommerce': 'DirectShop', Enterprise: 'CoreSuite', Healthcare: 'CarePortal',
  'Enterprise mobility': 'FieldOne', Fintech: 'PayBridge', FinTech: 'PayBridge', Retail: 'StoreLink',
  'Multi-location services': 'BranchFind', 'Marketplace app': 'MarketLink', Publisher: 'PressRoom',
  'Professional services': 'AdvisoryOne', Education: 'LearnPath',
};

/**
 * A demo metric value, chosen from what the label is measuring.
 *
 * Shapes rather than facts: a latency label gets a duration, a rate label gets a percentage.
 * That keeps the design's alignment and column widths intact — a metric tile sized for "38%"
 * looks broken holding a dash — while every one of them is demo data flagged for replacement.
 */
function metricValue(label: string, seed: number): string {
  const l = label.toLowerCase();
  const pick = <T>(arr: readonly T[]): T => arr[seed % arr.length]!;

  if (/latency|time to|start time|response time|glass-to-glass/.test(l)) return pick(['180 ms', '240 ms', '320 ms']);
  if (/time|duration|cycle|lead time|prep|handling/.test(l)) return pick(['−35%', '−42%', '−28%']);
  if (/cost|spend|infrastructure/.test(l)) return pick(['−24%', '−31%', '−18%']);
  if (/uptime|availability/.test(l)) return pick(['99.9%', '99.95%']);
  if (/rate|retention|accuracy|adoption|coverage|share|margin/.test(l)) return pick(['+18%', '+24%', '+31%']);
  if (/volume|tickets|incidents|escalation|false positive|manual|defect|churn|effort/.test(l)) {
    return pick(['−46%', '−52%', '−38%']);
  }
  if (/per |throughput|frequency|deployments|sessions|concurrent|viewers|active/.test(l)) {
    return pick(['2.1×', '1.8×', '3.0×']);
  }
  return pick(['+22%', '+15%', '2.0×']);
}

/* ------------------------------------------------------------------ testimonials */

/** Sector labels for demo testimonials — a category, never a named company. */
const SECTORS = [
  'B2B SaaS platform', 'Logistics operator', 'Healthcare provider', 'Fintech product',
  'E-commerce retailer', 'Manufacturing group', 'Education platform', 'Media company',
  'Insurance provider', 'Travel operator', 'Marketplace business', 'Professional services firm',
] as const;

const ROLES = [
  'Head of Engineering', 'Chief Technology Officer', 'Product Director', 'VP Engineering',
  'Head of Product', 'Operations Director', 'Founder', 'Head of Digital',
] as const;

const QUOTES = [
  'Demo testimonial — the team scoped the work honestly, flagged the risky parts early, and shipped on the dates they gave us.',
  'Demo testimonial — technical decisions were explained in terms we could act on, and nothing was hidden behind jargon.',
  'Demo testimonial — delivery pace stayed steady and the handover left our own engineers able to maintain the system.',
  'Demo testimonial — scope changes were handled without drama, and the estimate held.',
] as const;

/* ------------------------------------------------------------------ walker */

/*
  Deliberately broad.

  An earlier, tighter pattern required every character to be uppercase and missed
  `[CITY, COUNTRY]`, `[N]` and the article scaffold entirely — the strings were skipped before
  any substitution was attempted, so a whole class of placeholder survived silently. This only
  decides *whether to look*; the token map decides what actually gets replaced.
*/
const hasToken = /\[[A-Z][^\]]{0,300}\]/;

/** Rewrites every string in a document, returning how many substitutions were made. */
function rewrite(node: unknown, count: { n: number }): unknown {
  if (typeof node === 'string') {
    if (!hasToken.test(node)) return node;

    let out = node;
    for (const [token, value] of Object.entries(TOKENS)) {
      if (out.includes(token)) {
        out = out.split(token).join(value);
        count.n += 1;
      }
    }
    for (const [pattern, value] of PHRASES) {
      if (pattern.test(out)) {
        out = out.replace(pattern, value);
        count.n += 1;
      }
    }
    return out;
  }

  if (Array.isArray(node)) return node.map((item) => rewrite(item, count));

  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key === '_id' || key === '__v') continue;
      obj[key] = rewrite(obj[key], count);
    }
    return obj;
  }

  return node;
}

/**
 * Numbers repeated titles inside a list so no two entries read the same.
 *
 * The recognition band uses `[AWARD NAME]` twice on every page, so a single replacement value
 * produced two identical cards — which looks like a rendering fault to a reader, and was one
 * to React, whose warning about duplicate keys is what surfaced it. Numbering keeps the demo
 * labels obviously generic while making each card distinguishable.
 */
function numberDuplicates(node: unknown, field: string): boolean {
  let changed = false;

  if (Array.isArray(node)) {
    // Counted first, so a value that occurs once is left alone and only genuine collisions
    // get a suffix.
    const totals = new Map<string, number>();
    for (const item of node) {
      const value = (item as Record<string, unknown> | null)?.[field];
      if (typeof value === 'string' && value.startsWith('Demo ')) {
        totals.set(value, (totals.get(value) ?? 0) + 1);
      }
    }

    const used = new Map<string, number>();
    for (const item of node) {
      const obj = item as Record<string, unknown> | null;
      const value = obj?.[field];
      if (typeof value === 'string' && (totals.get(value) ?? 0) > 1) {
        const n = (used.get(value) ?? 0) + 1;
        used.set(value, n);
        obj![field] = `${value} ${n}`;
        changed = true;
      }
    }

    for (const item of node) if (numberDuplicates(item, field)) changed = true;
    return changed;
  }

  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (numberDuplicates(value, field)) changed = true;
    }
  }

  return changed;
}

/** Marks every top-level field dirty; the walk may have touched any of them. */
function markAll(doc: { markModified: (path: string) => void }, obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (key !== '_id' && key !== '__v') doc.markModified(key);
  }
}

type Doc = {
  toObject: () => Record<string, unknown>;
  set: (v: unknown) => void;
  markModified: (p: string) => void;
  save: () => Promise<unknown>;
};

type AnyModel = { find: (filter: Record<string, never>) => Promise<unknown[]> };

export async function seedDemoContent(): Promise<{ replaced: number; caseStudies: number; testimonials: number }> {
  const count = { n: 0 };

  /* ---------------------------------------------------------- case studies first */

  const studies = (await CaseStudyModel.find({})) as unknown as Array<Doc & { toObject: () => Record<string, unknown> }>;
  let studyCount = 0;

  for (const [index, doc] of studies.entries()) {
    const obj = doc.toObject();
    const category = String(obj.category ?? '');
    const name = PROJECT_NAMES[category] ?? `Demo Project ${String(index + 1).padStart(2, '0')}`;

    // Named before the generic walk, so `[PROJECT NAME]` inside the title, SEO and OG fields
    // all resolve to the same product rather than to a generic fallback.
    const named = JSON.parse(JSON.stringify(obj).split('[PROJECT NAME]').join(name)) as Record<string, unknown>;

    const metrics = named.metrics;
    if (Array.isArray(metrics)) {
      named.metrics = metrics.map((m, i) => {
        const metric = m as { value?: string; label?: string };
        if (metric.value && metric.value.includes('[VALUE]')) {
          return { ...metric, value: metricValue(metric.label ?? '', index * 3 + i) };
        }
        return metric;
      });
    }

    /*
      The frame caption, previously hardcoded into two components.

      Named after the product so it reads as a caption rather than as a slot, and set only
      when empty so an editor's own wording survives a re-seed.
    */
    if (!named.shotCaption) named.shotCaption = `${name} — product interface`;

    rewrite(named, count);
    named.demoContent = true;

    doc.set(named);
    markAll(doc, named);
    await doc.save();
    studyCount += 1;
  }

  /* ---------------------------------------------------------- testimonials */

  const testimonials = (await TestimonialModel.find({})) as unknown as Doc[];
  let testimonialCount = 0;

  for (const [index, doc] of testimonials.entries()) {
    const obj = doc.toObject();

    /*
      No invented person.

      A testimonial names someone and puts words in their mouth, so the name stays visibly a
      placeholder while the role and sector — which are categories, not identities — carry the
      professional detail that makes the section look finished.
    */
    obj.name = `Demo Client ${String(index + 1).padStart(2, '0')}`;
    obj.designation = ROLES[index % ROLES.length]!;
    obj.company = SECTORS[index % SECTORS.length]!;
    obj.industry = SECTORS[index % SECTORS.length]!.replace(/ (platform|operator|provider|product|retailer|group|company|business|firm)$/i, '');
    obj.duration = `${4 + (index % 9)} months`;
    if (typeof obj.content === 'string' && obj.content.includes('[')) {
      obj.content = QUOTES[index % QUOTES.length]!;
    }
    obj.demoContent = true;

    rewrite(obj, count);
    doc.set(obj);
    markAll(doc, obj);
    await doc.save();
    testimonialCount += 1;
  }

  /* ---------------------------------------------------------- everything else */

  const COLLECTIONS: AnyModel[] = [
    ServicePageModel,
    SitePageModel,
    BlogPostModel,
    FaqModel,
  ] as unknown as AnyModel[];

  for (const model of COLLECTIONS) {
    const docs = (await model.find({})) as unknown as Doc[];
    for (const doc of docs) {
      const obj = doc.toObject();
      const before = count.n;
      rewrite(obj, count);

      /*
        Run unconditionally, after substitution.

        The duplicates only exist once the tokens have collapsed onto one demo value, and a
        document seeded by an earlier run already holds them with no token left to trigger a
        rewrite — so gating this on "did anything change" would leave exactly the records that
        need fixing untouched.
      */
      const renamed = numberDuplicates(obj, 'title');

      if (count.n > before || renamed) {
        doc.set(obj);
        markAll(doc, obj);
        await doc.save();
      }
    }
  }

  const settings = await SiteSettingsModel.findOne({ singleton: 'site' });
  if (settings) {
    const obj = settings.toObject() as Record<string, unknown>;
    const before = count.n;
    rewrite(obj, count);
    if (count.n > before) {
      settings.set(obj);
      markAll(settings, obj);
      await settings.save();
    }
  }

  logger.info(
    { replaced: count.n, caseStudies: studyCount, testimonials: testimonialCount },
    'Demo content filled in',
  );

  return { replaced: count.n, caseStudies: studyCount, testimonials: testimonialCount };
}
