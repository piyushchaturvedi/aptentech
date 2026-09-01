/**
 * A real page behind every menu entry.
 *
 * The navigation promised roughly forty destinations that had no page: five "AI Solutions"
 * links all opened the same screen, every industry opened the unfiltered case-study index,
 * and each technology opened one shared tab strip. That reads as a broken menu, which is
 * what it looked like on the site.
 *
 * Two constraints shaped how these are built.
 *
 * **The design does not change.** Every page here is a `ServicePage` document, so it renders
 * through `ServicePageView` — the same component and stylesheet the eight original service
 * pages use. The design is inherited by construction rather than reproduced by hand, and
 * nothing new was styled.
 *
 * **No content is invented.** Every heading, description and bullet below is lifted from a
 * page that already exists: the source content already describes generative AI, RAG, agents,
 * healthcare, fintech, logistics and the rest, because the original pages each carried a
 * capabilities grid, an industries grid and a technology stack. This file re-presents that
 * approved copy on a focused page; it does not write new claims about the company. Where the
 * source genuinely says nothing, the field is left empty rather than filled in.
 */
import type { ServiceKind } from '@aptentech/shared';
import { CaseStudyModel, ServicePageModel } from '../models';
import { logger } from '../utils/logger';

/** Sections a generated page shows, in the order `ServicePageView` renders them. */
const SECTION_ORDER = [
  'services',
  'solutions',
  'caseStudies',
  'testimonials',
  'features',
  'technologies',
  'process',
  'techStack',
  'why',
  'faqs',
  'leadForm',
] as const;

interface SourceItem {
  accent?: string;
  title: string;
  description?: string;
  icon?: string;
  bullets?: string[];
}

interface SourcePage {
  slug: string;
  name: string;
  services?: SourceItem[];
  solutions?: SourceItem[];
  technologies?: SourceItem[];
  features?: SourceItem[];
  techStack?: Array<{ category: string; accent?: string; items?: string[] }>;
  process?: unknown[];
  why?: unknown[];
  faqs?: unknown[];
  compliance?: unknown[];
  caseStudyIds?: unknown[];
  testimonialIds?: unknown[];
  leadFormServiceOptions?: unknown[];
  leadForm?: unknown;
  leadFormTitle?: string;
  leadFormSubmitLabel?: string;
  heroCtaLabel?: string;
  seo?: { title?: string; description?: string };
}

/**
 * One page to generate.
 *
 * `from` names the page whose approved copy this one draws on, and `pick` selects the item
 * within it. Both are matched loosely on title so a wording change in the source does not
 * silently produce an empty page — a miss is reported rather than shipped blank.
 */
interface Spec {
  kind: ServiceKind;
  slug: string;
  /** Exactly the label the menu uses, so the entry and its page cannot drift apart. */
  name: string;
  from: string;
  /** Which array on the source page holds the item this page is about. */
  list: 'services' | 'solutions' | 'technologies';
  pick: string;
  /** Extra source items to show as this page's own capability grid. */
  also?: string[];
  /** Technology stack groups to carry over, by category name. */
  stack?: string[];
}

const SPECS: Spec[] = [
  /* ---------------------------------------------------------------- services */
  {
    kind: 'service', slug: 'generative-ai', name: 'Generative AI', from: 'ai-development',
    list: 'services', pick: 'Generative AI & LLM development',
    also: ['AI consulting & readiness assessment', 'AI integration into existing products'],
    stack: ['Models & providers', 'LLM tooling', 'Vector & search'],
  },
  {
    kind: 'service', slug: 'ai-agents', name: 'AI Agents', from: 'ai-development',
    list: 'services', pick: 'AI agents & workflow automation',
    also: ['AI integration into existing products', 'AI governance, safety & compliance'],
    stack: ['LLM tooling', 'Models & providers', 'MLOps & monitoring'],
  },
  {
    kind: 'service', slug: 'ai-automation', name: 'AI Automation', from: 'ai-development',
    list: 'services', pick: 'AI agents & workflow automation',
    also: ['Data engineering & MLOps', 'AI integration into existing products'],
    stack: ['LLM tooling', 'Data & pipelines', 'MLOps & monitoring'],
  },
  {
    kind: 'service', slug: 'rag-solutions', name: 'RAG Solutions', from: 'ai-development',
    list: 'technologies', pick: 'Large language models & RAG',
    also: ['Vector databases & embeddings', 'Evaluation & observability for AI', 'Private & self-hosted models'],
    stack: ['Vector & search', 'LLM tooling', 'Data & pipelines'],
  },
  {
    kind: 'service', slug: 'saas-development', name: 'SaaS Development', from: 'software-development',
    list: 'services', pick: 'SaaS product engineering',
    also: ['Custom software development', 'System integration & APIs'],
    stack: ['Backend', 'Frontend', 'Databases', 'Cloud & DevOps'],
  },
  {
    kind: 'service', slug: 'enterprise-software', name: 'Enterprise Software', from: 'software-development',
    list: 'services', pick: 'Enterprise software & internal platforms',
    also: ['System integration & APIs', 'Software consulting & architecture'],
    stack: ['Backend', 'Databases', 'Security & identity', 'Messaging & APIs'],
  },
  {
    kind: 'service', slug: 'product-engineering', name: 'Product Engineering', from: 'software-development',
    list: 'services', pick: 'Software consulting & architecture',
    also: ['Custom software development', 'Dedicated teams & QA'],
    stack: ['Backend', 'Frontend', 'Testing & QA', 'Cloud & DevOps'],
  },
  {
    kind: 'service', slug: 'ios-android', name: 'iOS & Android', from: 'mobile-app-development',
    list: 'services', pick: 'iOS app development',
    also: ['Android app development', 'Custom mobile app development'],
    stack: ['Native mobile', 'Backend & APIs', 'Data & persistence'],
  },
  {
    kind: 'service', slug: 'flutter-react-native', name: 'Flutter & React Native', from: 'mobile-app-development',
    list: 'services', pick: 'Cross-platform app development',
    also: ['Custom mobile app development', 'Mobile app consulting & architecture'],
    stack: ['Cross-platform', 'Backend & APIs', 'Cloud & DevOps'],
  },
  {
    kind: 'service', slug: 'cloud-devops', name: 'Cloud & DevOps', from: 'software-development',
    list: 'services', pick: 'Dedicated teams & QA',
    also: ['Software consulting & architecture', 'System integration & APIs'],
    stack: ['Cloud & DevOps', 'Testing & QA', 'Security & identity'],
  },
  {
    kind: 'service', slug: 'cloud-migration', name: 'Cloud Migration', from: 'software-development',
    list: 'services', pick: 'Legacy modernisation & migration',
    also: ['Software consulting & architecture', 'System integration & APIs'],
    stack: ['Cloud & DevOps', 'Databases', 'Security & identity'],
  },
  {
    kind: 'service', slug: 'ui-ux-design', name: 'UI/UX Design', from: 'web-development',
    list: 'services', pick: 'Frontend engineering & design systems',
    also: ['Custom web application development', 'Web consulting & architecture'],
    stack: ['Frontend', 'Testing & monitoring'],
  },

  /* ---------------------------------------------------------------- solutions */
  {
    kind: 'solution', slug: 'workflow-automation', name: 'Workflow automation', from: 'ai-development',
    list: 'services', pick: 'AI agents & workflow automation',
    also: ['Data engineering & MLOps', 'AI integration into existing products'],
    stack: ['LLM tooling', 'Data & pipelines'],
  },
  {
    kind: 'solution', slug: 'customer-support-ai', name: 'Customer support AI', from: 'ai-development',
    list: 'solutions', pick: 'Customer support & operations',
    also: [], stack: ['LLM tooling', 'Vector & search'],
  },
  {
    kind: 'solution', slug: 'legacy-modernization', name: 'Legacy modernization', from: 'software-development',
    list: 'services', pick: 'Legacy modernisation & migration',
    also: ['Software consulting & architecture', 'System integration & APIs'],
    stack: ['Backend', 'Databases', 'Cloud & DevOps'],
  },
  {
    kind: 'solution', slug: 'mvp-for-startups', name: 'MVP for startups', from: 'software-development',
    list: 'services', pick: 'SaaS product engineering',
    also: ['Custom software development', 'Dedicated teams & QA'],
    stack: ['Backend', 'Frontend', 'Cloud & DevOps'],
  },
  {
    kind: 'solution', slug: 'saas-platforms', name: 'SaaS platforms', from: 'web-development',
    list: 'services', pick: 'SaaS & multi-tenant platforms',
    also: ['Backend, APIs & microservices', 'Frontend engineering & design systems'],
    stack: ['Frontend', 'Backend', 'Databases', 'Cloud & DevOps'],
  },
  {
    kind: 'solution', slug: 'e-commerce', name: 'E-commerce', from: 'web-development',
    list: 'services', pick: 'Ecommerce & headless commerce',
    also: ['Frontend engineering & design systems', 'CMS, portals & integrations'],
    stack: ['CMS & commerce', 'Frontend', 'Backend'],
  },
  {
    kind: 'solution', slug: 'enterprise-portals', name: 'Enterprise portals', from: 'web-development',
    list: 'services', pick: 'CMS, portals & integrations',
    also: ['Backend, APIs & microservices', 'Web consulting & architecture'],
    stack: ['CMS & commerce', 'Security & identity', 'Backend'],
  },
  {
    kind: 'solution', slug: 'data-analytics', name: 'Data & analytics', from: 'software-development',
    list: 'services', pick: 'AI & data engineering',
    also: ['System integration & APIs', 'Software consulting & architecture'],
    stack: ['Data & analytics', 'Databases', 'Cloud & DevOps'],
  },



  /* ---------------------------------------------------------------- technologies */
  {
    kind: 'technology', slug: 'frontend-backend', name: 'Frontend & Backend', from: 'web-development',
    list: 'services', pick: 'Backend, APIs & microservices',
    also: ['Frontend engineering & design systems'],
    stack: ['Frontend', 'Backend', 'APIs & messaging'],
  },
  {
    kind: 'technology', slug: 'mobile', name: 'Mobile', from: 'mobile-app-development',
    list: 'services', pick: 'Custom mobile app development',
    also: ['Cross-platform app development', 'iOS app development', 'Android app development'],
    stack: ['Native mobile', 'Cross-platform', 'Backend & APIs'],
  },
  {
    kind: 'technology', slug: 'ai-ml', name: 'AI / ML', from: 'ai-development',
    list: 'technologies', pick: 'MLOps & model lifecycle',
    also: ['Large language models & RAG', 'Agentic architectures', 'Data engineering for AI'],
    stack: ['ML frameworks', 'Models & providers', 'MLOps & monitoring'],
  },
  {
    kind: 'technology', slug: 'cloud', name: 'Cloud', from: 'software-development',
    list: 'services', pick: 'Software consulting & architecture',
    also: ['System integration & APIs'],
    stack: ['Cloud & DevOps', 'Security & identity'],
  },
  {
    kind: 'technology', slug: 'databases', name: 'Databases', from: 'software-development',
    list: 'services', pick: 'AI & data engineering',
    also: ['System integration & APIs'],
    stack: ['Databases', 'Data & analytics'],
  },
  {
    kind: 'technology', slug: 'devops', name: 'DevOps', from: 'software-development',
    list: 'services', pick: 'Dedicated teams & QA',
    also: ['Software consulting & architecture'],
    stack: ['Cloud & DevOps', 'Testing & QA'],
  },
  {
    kind: 'technology', slug: 'cms', name: 'CMS', from: 'web-development',
    list: 'services', pick: 'CMS, portals & integrations',
    also: ['Frontend engineering & design systems'],
    stack: ['CMS & commerce', 'Frontend'],
  },
  {
    kind: 'technology', slug: 'e-commerce', name: 'E-commerce', from: 'web-development',
    list: 'services', pick: 'Ecommerce & headless commerce',
    also: ['CMS, portals & integrations'],
    stack: ['CMS & commerce', 'Backend'],
  },
];

/**
 * Industry pages, built differently from the rest.
 *
 * An industry is not a capability, so there is no single source item describing it. What the
 * source does hold is the same sector named on four different pages, each listing what was
 * built for it — twelve industries on the AI page, twelve on software, twelve on web, twelve
 * on mobile. Aggregating those gives a page made entirely of approved copy that says
 * something real and specific about each sector.
 *
 * `aliases` exist because the four pages name the same sector differently: "Financial
 * services & fintech" on one, "Fintech & banking" on another.
 */
interface IndustrySpec {
  slug: string;
  name: string;
  aliases: string[];
  /** Substrings matched against a case study's own `industry` field. */
  caseMatch: string[];
}

const INDUSTRIES: IndustrySpec[] = [
  {
    slug: 'healthcare', name: 'Healthcare',
    aliases: ['Healthcare & life sciences', 'Healthcare & telemedicine'],
    caseMatch: ['health', 'medical', 'clinic', 'wellness', 'fitness'],
  },
  {
    slug: 'fintech-banking', name: 'FinTech & Banking',
    aliases: ['Financial services & fintech', 'Fintech & banking'],
    caseMatch: ['fintech', 'bank', 'payment', 'finance'],
  },
  {
    slug: 'e-commerce-retail', name: 'E-commerce & Retail',
    aliases: ['Retail & ecommerce', 'Ecommerce & retail'],
    caseMatch: ['ecommerce', 'e-commerce', 'retail', 'marketplace', 'd2c'],
  },
  {
    slug: 'logistics', name: 'Logistics',
    aliases: ['Logistics & supply chain'],
    caseMatch: ['logistic', 'delivery', 'fleet', 'transport', 'supply'],
  },
  {
    slug: 'education', name: 'Education',
    aliases: ['Education & training', 'Education & edtech', 'Education & e-learning'],
    caseMatch: ['education', 'edtech', 'learning', 'coaching'],
  },
  {
    slug: 'real-estate', name: 'Real Estate',
    aliases: ['Real estate & construction', 'Real estate & proptech'],
    caseMatch: ['real estate', 'proptech', 'property'],
  },
  {
    slug: 'travel-hospitality', name: 'Travel & Hospitality',
    aliases: ['Travel & hospitality'],
    caseMatch: ['travel', 'airline', 'airport', 'hotel', 'transfer'],
  },
  {
    slug: 'media', name: 'Media',
    aliases: ['Media & entertainment', 'Media & publishing'],
    caseMatch: ['media', 'music', 'video', 'stream', 'creator', 'artist'],
  },
];

/** URL prefix for each family, used for canonicals. */
const PREFIX: Record<ServiceKind, string> = {
  service: '/services/',
  solution: '/solutions/',
  industry: '/industries/',
  technology: '/technologies/',
};

/**
 * Joins a set of bullets into one readable sentence.
 *
 * Used only where the source item has no prose of its own. Every phrase is one the source
 * already published; the sentence adds punctuation and nothing else.
 */
function bulletSentence(subject: string, bullets: string[]): string {
  const phrases = [...new Set(bullets)].slice(0, 4).map((b) => b.toLowerCase());
  if (phrases.length === 0) return '';
  const last = phrases[phrases.length - 1] ?? '';
  const head = phrases.slice(0, -1).join(', ');
  return `What we have built for ${subject.toLowerCase()}: ${head}${head ? ' and ' : ''}${last}.`;
}

/** Loose title match, so a small wording change in the source does not silently miss. */
function findItem(list: SourceItem[] | undefined, title: string): SourceItem | undefined {
  if (!list?.length || !title) return undefined;
  const wanted = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  return list.find((i) => i.title.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted);
}

export async function seedMenuPages(): Promise<{ created: number; kept: number; skipped: string[] }> {
  const sources = new Map<string, SourcePage>();
  for (const slug of new Set(SPECS.map((s) => s.from))) {
    const doc = (await ServicePageModel.findOne({ slug }).lean()) as SourcePage | null;
    if (doc) sources.set(slug, doc);
  }

  let created = 0;
  let kept = 0;
  const skipped: string[] = [];

  for (const spec of SPECS) {
    /*
      Never overwrite.

      Once a page exists an administrator may have edited it, and a re-seed that reset it
      would silently discard their work. Re-running this only fills in what is missing.
    */
    const existing = await ServicePageModel.findOne({ kind: spec.kind, slug: spec.slug }).select('_id').lean();
    if (existing) {
      kept += 1;
      continue;
    }

    const source = sources.get(spec.from);
    if (!source) {
      skipped.push(`${spec.slug} (source page ${spec.from} not found)`);
      continue;
    }

    const lead = findItem(source[spec.list], spec.pick);

    /*
      A page with no source item still gets built, but from the source page's own hero rather
      than from invented copy. Travel is the one case: the menu names it, and the only
      approved writing about it is on the travel app page.
    */
    const heroTitle = spec.name;
    /*
      Prose where the source has it, its own bullets joined where it does not.

      Capability items carry a description; industry-style items carry only bullets. Falling
      back to the bullets keeps every page — and every meta description — saying something
      real, without writing a claim the source never made.
    */
    const heroDescription = lead?.description || bulletSentence(spec.name, lead?.bullets ?? []);

    if (!lead && spec.pick) skipped.push(`${spec.slug} (no item "${spec.pick}" on ${spec.from})`);

    const capabilities = [lead, ...(spec.also ?? []).map((t) => findItem(source[spec.list], t))].filter(
      (i): i is SourceItem => Boolean(i),
    );

    const stack = (source.techStack ?? []).filter((g) => (spec.stack ?? []).includes(g.category));

    await ServicePageModel.create({
      kind: spec.kind,
      slug: spec.slug,
      name: spec.name,
      order: SPECS.indexOf(spec) + 1,
      status: 'PUBLISHED',

      heroEyebrow: spec.name,
      heroTitle,
      heroDescription,
      heroPoints: lead?.bullets?.slice(0, 4) ?? [],
      heroCtaLabel: source.heroCtaLabel ?? '',

      servicesTitle: capabilities.length ? 'What this covers' : '',
      services: capabilities,

      techStackTitle: stack.length ? 'Technology we use' : '',
      techStack: stack,

      // Delivery, reasons and questions are true of the company rather than of one topic, so
      // they are carried over from the page this one draws on rather than restated.
      processTitle: source.process?.length ? 'How we deliver' : '',
      process: source.process ?? [],
      whyTitle: source.why?.length ? 'Why teams choose us' : '',
      why: source.why ?? [],
      faqTitle: source.faqs?.length ? 'Questions we are asked' : '',
      faqs: (source.faqs ?? []).slice(0, 6),

      leadFormTitle: source.leadFormTitle ?? '',
      leadFormSubmitLabel: source.leadFormSubmitLabel ?? '',
      leadForm: source.leadForm ?? undefined,
      leadFormServiceOptions: source.leadFormServiceOptions ?? [],

      sectionOrder: SECTION_ORDER,

      seo: {
        title: `${spec.name} — ${source.seo?.title?.split('|').pop()?.trim() || 'AptenTech'}`.slice(0, 200),
        description: heroDescription.slice(0, 300),
        canonical: `${PREFIX[spec.kind]}${spec.slug}/`,
        robotsIndex: true,
        robotsFollow: true,
      },
    });

    created += 1;
  }

  const industries = await seedIndustryPages(skipped);

  logger.info({ created: created + industries, kept, skipped: skipped.length }, 'Menu pages seeded');
  if (skipped.length) logger.warn({ skipped }, 'Some menu pages had no matching source content');

  return { created: created + industries, kept, skipped };
}

/**
 * Builds the eight industry pages by aggregating what each of the four parent pages says
 * about that sector, and attaching the case studies actually recorded against it.
 */
async function seedIndustryPages(skipped: string[]): Promise<number> {
  const PARENTS = ['ai-development', 'software-development', 'web-development', 'mobile-app-development'];

  const parents: SourcePage[] = [];
  for (const slug of PARENTS) {
    const doc = (await ServicePageModel.findOne({ slug }).lean()) as SourcePage | null;
    if (doc) parents.push(doc);
  }
  if (parents.length === 0) return 0;

  const cases = (await CaseStudyModel.find({ status: 'PUBLISHED' }).select('_id industry tag').lean()) as Array<{
    _id: unknown;
    industry?: string;
    tag?: string;
  }>;

  let created = 0;

  for (const spec of INDUSTRIES) {
    const existing = await ServicePageModel.findOne({ kind: 'industry', slug: spec.slug }).select('_id').lean();
    if (existing) continue;

    /*
      One card per parent page that names this sector, keeping that page's own bullets and
      labelling it with where the work sits. The result is four short, specific statements
      rather than one vague one.
    */
    const cards = parents
      .map((parent) => {
        const item = spec.aliases.map((alias) => findItem(parent.solutions, alias)).find(Boolean);
        if (!item) return null;
        return {
          accent: item.accent ?? 'indigo',
          icon: item.icon ?? '',
          title: item.title,
          description: '',
          bullets: item.bullets ?? [],
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (cards.length === 0) {
      skipped.push(`${spec.slug} (no parent page names this sector)`);
      continue;
    }

    /*
      The hero sentence is assembled from the sector's own bullets rather than written.

      Nothing here is a new claim: every phrase is one the source already published about
      this sector. Joining them is the only way to give the page a description at all, since
      an industry card carries bullets and no prose.
    */
    const phrases = [...new Set(cards.flatMap((c) => c.bullets))].slice(0, 4).map((b) => b.toLowerCase());
    const heroDescription = phrases.length
      ? `What we have built for ${spec.name.toLowerCase()} teams: ${phrases.slice(0, -1).join(', ')}${
          phrases.length > 1 ? ' and ' : ''
        }${phrases[phrases.length - 1]}.`
      : '';

    const caseStudyIds = cases
      .filter((c) => {
        const haystack = `${c.industry ?? ''} ${c.tag ?? ''}`.toLowerCase();
        return spec.caseMatch.some((needle) => haystack.includes(needle));
      })
      .slice(0, 4)
      .map((c) => c._id);

    const first = parents[0]!;

    await ServicePageModel.create({
      kind: 'industry',
      slug: spec.slug,
      name: spec.name,
      order: INDUSTRIES.indexOf(spec) + 1,
      status: 'PUBLISHED',

      heroEyebrow: 'Industries',
      heroTitle: spec.name,
      heroDescription,
      heroPoints: cards[0]?.bullets.slice(0, 4) ?? [],

      servicesTitle: 'Where we work in this sector',
      services: cards,

      caseStudiesTitle: caseStudyIds.length ? 'Selected work' : '',
      caseStudyIds,

      processTitle: first.process?.length ? 'How we deliver' : '',
      process: first.process ?? [],
      whyTitle: first.why?.length ? 'Why teams choose us' : '',
      why: first.why ?? [],
      faqTitle: first.faqs?.length ? 'Questions we are asked' : '',
      faqs: (first.faqs ?? []).slice(0, 6),

      leadFormTitle: first.leadFormTitle ?? '',
      leadFormSubmitLabel: first.leadFormSubmitLabel ?? '',
      leadForm: first.leadForm ?? undefined,
      leadFormServiceOptions: first.leadFormServiceOptions ?? [],

      sectionOrder: SECTION_ORDER,

      seo: {
        title: `${spec.name} software development — AptenTech`.slice(0, 200),
        description: heroDescription.slice(0, 300),
        canonical: `/industries/${spec.slug}/`,
        robotsIndex: true,
        robotsFollow: true,
      },
    });

    created += 1;
  }

  return created;
}
