import { z } from 'zod';
import { emailListSchema, headerSafeText, optionalEmail } from './email';
import { BLOCK_TYPES, CASE_SHOTS, HERO_DECORATIONS } from '../types/content';
import { PUBLISH_STATUSES } from '../types/primitives';
import {
  accentSchema,
  ctaLinkSchema,
  mediaRefSchema,
  objectIdSchema,
  paginationSchema,
  publishStatusSchema,
  queryString,
  safeHref,
  seoSchema,
  serviceKindSchema,
  slugSchema,
} from './common';

/**
 * `icon` is a key into the design layer's icon registry, never raw SVG. Storing SVG
 * markup from an editor would be a stored-XSS sink and would let the CMS change the
 * approved icon set; a key cannot do either.
 */
const iconKey = z.string().trim().max(64).default('');
const shortText = z.string().trim().max(300);
const longText = z.string().trim().max(6000);
const bulletList = z.array(z.string().trim().min(1).max(400)).max(30).default([]);

export const serviceItemSchema = z.object({
  accent: accentSchema,
  title: shortText.min(1),
  description: longText.default(''),
  icon: iconKey,
  bullets: bulletList,
});

export const solutionItemSchema = z.object({
  accent: accentSchema,
  title: shortText.min(1),
  featured: z.boolean().default(false),
  icon: iconKey,
  bullets: bulletList,
});

export const featureGroupSchema = z.object({
  accent: accentSchema,
  title: shortText.min(1),
  description: longText.default(''),
  icon: iconKey,
  items: bulletList,
});

export const technologyItemSchema = z.object({
  outcome: longText.optional().default(''),
  accent: accentSchema,
  title: shortText.min(1),
  description: longText.default(''),
  icon: iconKey,
});

export const complianceBadgeSchema = z.object({
  accent: accentSchema,
  label: shortText.min(1),
  icon: iconKey,
});

export const processStepSchema = z.object({
  title: shortText.min(1),
  description: longText.default(''),
  deliverables: bulletList,
});

export const techStackGroupSchema = z.object({
  category: shortText.min(1),
  accent: accentSchema,
  items: bulletList,
});

export const whyItemSchema = z.object({
  title: shortText.min(1),
  description: longText.default(''),
});

export const faqItemSchema = z.object({
  id: objectIdSchema.optional(),
  question: shortText.min(1),
  answer: longText.min(1),
  category: z.string().trim().max(120).optional().default(''),
  order: z.number().int().min(0).max(9999).optional().default(0),
  visible: z.boolean().optional().default(true),
});

export const caseMetricSchema = z.object({
  value: z.string().trim().max(80),
  label: z.string().trim().max(120),
});

export const caseStudySchema = z.object({
  slug: slugSchema,
  accent: accentSchema,
  industry: shortText.default(''),
  techSummary: shortText.default(''),
  tag: shortText.default(''),
  title: shortText.min(1),
  problem: longText.default(''),
  solution: longText.default(''),
  result: longText.default(''),
  metrics: z.array(caseMetricSchema).max(8).default([]),
  shot: z.enum(CASE_SHOTS).default('chart'),
  shotCaption: z.string().trim().max(200).default(''),
  shotConsole: z
    .object({
      command: shortText.default(''),
      checks: z.array(shortText).max(8).default([]),
      summary: shortText.default(''),
    })
    .default({ command: '', checks: [], summary: '' }),
  showInIndex: z.boolean().default(true),
  detailHref: safeHref.nullable().default(null),
  technologies: bulletList,
  category: shortText.default(''),
  projectUrl: safeHref.default(''),
  featured: z.boolean().default(false),
  order: z.number().int().min(0).max(9999).default(0),
  status: publishStatusSchema.default('DRAFT'),
  images: z.array(mediaRefSchema).max(12).default([]),
  seo: seoSchema,
});

export const testimonialSchema = z.object({
  name: shortText.min(1),
  designation: shortText.default(''),
  company: shortText.default(''),
  content: longText.min(1),
  industry: shortText.default(''),
  duration: shortText.default(''),
  rating: z.number().min(0).max(5).nullable().default(null),
  photo: mediaRefSchema,
  attachedTo: z.array(z.string().trim().max(120)).max(40).default([]),
  order: z.number().int().min(0).max(9999).default(0),
  visible: z.boolean().default(true),
});

export const blogCategorySchema = z.object({
  slug: slugSchema,
  name: shortText.min(1),
  description: longText.default(''),
  seo: seoSchema,
});

export const blogPostSchema = z.object({
  slug: slugSchema,
  accent: accentSchema,
  title: shortText.min(1),
  excerpt: longText.default(''),
  /** Sanitised server-side on write and again on render — never trusted as stored. */
  body: z.string().max(200_000).default(''),
  categoryId: objectIdSchema.nullable().default(null),
  categoryName: shortText.default(''),
  tags: z.array(z.string().trim().max(60)).max(20).default([]),
  authorName: shortText.default(''),
  authorRole: shortText.default(''),
  authorBio: longText.default(''),
  coverImage: mediaRefSchema,
  readingMinutes: z.number().int().min(0).max(180).default(0),
  status: publishStatusSchema.default('DRAFT'),
  publishedAt: z.string().datetime().nullable().default(null),
  faqs: z.array(faqItemSchema).max(30).default([]),
  seo: seoSchema,
});

const blockBase = {
  key: z.string().trim().min(1).max(64),
  type: z.enum(BLOCK_TYPES),
  enabled: z.boolean().default(true),
  eyebrow: shortText.optional().default(''),
  title: shortText.optional().default(''),
  body: longText.optional().default(''),
};

/** Every lead form on the site takes its labels and options from one of these. */
export const leadFormConfigSchema = z
  .object({
    title: shortText.default('Get a free consultation'),
    submitLabel: shortText.default('Get a Free Consultation'),
    serviceLabel: shortText.default('Service required'),
    serviceOptions: z.array(z.string().trim().max(160)).max(40).default([]),
    budgetLabel: shortText.default('Approximate budget'),
    budgetOptions: z.array(z.string().trim().max(160)).max(40).default([]),
    budgetNote: longText.default(''),
    detailsLabel: shortText.default('Project details'),
    detailsPlaceholder: longText.default(''),
    reassurance: longText.default('No obligation. Your project details remain confidential.'),
  })
  .default({});

/**
 * Blocks are validated as a permissive union rather than a strict discriminated union so
 * that a block carrying extra fields for its own type still validates. Each renderer
 * reads only the fields it knows about, and `type` is constrained to the closed set.
 */
/** The icon card the quick-facts, values, why and AI grids all share. */
export const iconCardSchema = z.object({
  accent: accentSchema,
  icon: iconKey,
  title: shortText.min(1),
  description: longText.default(''),
});

export const pageBlockSchema = z
  .object({
    ...blockBase,
    ctas: z.array(ctaLinkSchema).max(6).optional().default([]),
    image: mediaRefSchema.optional(),
    imageSide: z.enum(['left', 'right']).optional().default('left'),
    onDark: z.boolean().optional().default(false),
    html: z.string().max(200_000).optional().default(''),
    bullets: bulletList.optional(),
    items: z.array(z.any()).max(60).optional().default([]),
    stats: z
      .array(z.object({ value: shortText, suffix: z.string().trim().max(12).default(''), label: shortText }))
      .max(12)
      .optional()
      .default([]),
    steps: z.array(processStepSchema).max(20).optional().default([]),
    badges: z.array(complianceBadgeSchema).max(20).optional().default([]),
    faqs: z.array(faqItemSchema).max(40).optional().default([]),
    /*
      Two block types carry offices under different field names: the office-card grid labels
      each entry by `city`, while the contact page's lead-form aside labels them by `label`
      ("Headquarters", "Get in touch"). Requiring `city` for both rejected the home page
      outright — reading it and saving it back unchanged returned a validation error, so no
      administrator could edit that page at all. Both names are optional here; the block's own
      renderer knows which one it reads.
    */
    offices: z
      .array(
        z
          .object({
            city: shortText.optional().default(''),
            label: shortText.optional().default(''),
            lines: z.array(z.string().trim().max(200)).max(8).default([]),
          })
          .passthrough(),
      )
      .max(12)
      .optional()
      .default([]),
    // Legal documents: the heading block, the review notice, and the clause anchors that
    // build the table of contents. `bodyHtml` reuses `html` above.
    heading: shortText.optional().default(''),
    meta: z.array(shortText).max(6).optional().default([]),
    notice: z.string().max(20_000).optional().default(''),
    tocLabel: shortText.optional().default(''),
    bodyHtml: z.string().max(400_000).optional().default(''),
    clauses: z
      .array(z.object({ id: z.string().trim().max(60), number: shortText, title: shortText }))
      .max(60)
      .optional()
      .default([]),
    // Contact page bands.
    crumbLabel: shortText.optional().default(''),
    // The section indexes carry only wording; the cards below them are the live page list.
    lede: longText.optional().default(''),
    reasons: z
      .array(z.object({ accent: accentSchema, icon: iconKey, title: shortText, description: longText }))
      .max(8)
      .optional()
      .default([]),
    formTitle: shortText.optional().default(''),
    formTitleTag: z.enum(['h2', 'h3']).optional().default('h2'),
    formNote: shortText.optional().default(''),
    headingId: z.string().trim().max(60).optional().default(''),
    paddingBlock: z.string().trim().max(120).optional().default(''),
    kicker: shortText.optional().default(''),
    // Home and about bands. The heroes split their headline around a highlighted phrase.
    splitHeading: z
      .object({ lead: shortText.default(''), highlight: shortText.default(''), trail: shortText.default('') })
      .optional(),
    pillText: shortText.optional().default(''),
    pillStrong: shortText.optional().default(''),
    sub: longText.optional().default(''),
    note: longText.optional().default(''),
    trustedLabel: shortText.optional().default(''),
    logoSlots: z.array(shortText).max(40).optional().default([]),
    capabilitiesTitle: shortText.optional().default(''),
    capabilities: z.array(shortText).max(20).optional().default([]),
    mediaLabel: shortText.optional().default(''),
    mediaHint: shortText.optional().default(''),
    quickCards: z.array(iconCardSchema).max(8).optional().default([]),
    values: z.array(iconCardSchema).max(12).optional().default([]),
    principles: z
      .array(
        z.object({
          accent: accentSchema,
          number: shortText.default(''),
          title: shortText,
          description: longText.default(''),
        }),
      )
      .max(12)
      .optional()
      .default([]),
    // Declared lazily: these item schemas are defined further down the file, and a block
    // schema evaluated at module load cannot reference them directly.
    awardLead: z.lazy(() => awardLeadSchema).optional(),
    awards: z.lazy(() => z.array(awardSchema).max(20)).optional(),
    groups: z.lazy(() => z.array(techStackGroupSchema).max(12)).optional(),
    centred: z.boolean().optional().default(false),
    askTitle: shortText.optional().default(''),
    askBody: longText.optional().default(''),
    askCtaLabel: shortText.optional().default(''),
    buttonLabel: shortText.optional().default(''),
    insightCards: z
      .array(z.object({ slug: z.string().trim().max(160), label: shortText.default(''), accent: accentSchema }))
      .max(12)
      .optional()
      .default([]),
    points: z.array(shortText).max(12).optional().default([]),
    shareLabel: shortText.optional().default(''),
    authorLabel: shortText.optional().default(''),
    prevLabel: shortText.optional().default(''),
    nextLabel: shortText.optional().default(''),
    relatedTitle: shortText.optional().default(''),
    relatedLede: longText.optional().default(''),
    defaultBody: z.string().max(200_000).optional().default(''),
    listHeading: shortText.optional().default(''),
    sidebarTitle: shortText.optional().default(''),
    sidebarSubtitle: longText.optional().default(''),
    ctaLabel: shortText.optional().default(''),
    ctaHref: safeHref.optional().default(''),
    leadForm: leadFormConfigSchema.optional(),
    formSubtitle: longText.optional().default(''),
    stepCards: z
      .array(z.object({ number: shortText.default(''), title: shortText, description: longText, accent: accentSchema }))
      .max(12)
      .optional()
      .default([]),
    routes: z
      .array(
        z.object({
          accent: accentSchema,
          icon: iconKey,
          title: shortText,
          description: longText,
          linkLabel: shortText.default(''),
          href: safeHref.default(''),
        }),
      )
      .max(12)
      .optional()
      .default([]),
    cards: z
      .array(
        z.object({
          accent: accentSchema,
          kind: shortText.default(''),
          city: shortText.default(''),
          addressLines: z.array(z.string().trim().max(200)).max(8).default([]),
          phoneLabel: shortText.default(''),
          phoneHref: safeHref.default(''),
        }),
      )
      .max(12)
      .optional()
      .default([]),
    emitSchema: z.boolean().optional().default(true),
    limit: z.number().int().min(0).max(60).optional().default(6),
    submitLabel: shortText.optional().default(''),
    serviceOptions: z.array(z.string().trim().max(160)).max(40).optional().default([]),
  })
  .passthrough();

export const sitePageSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  title: shortText.min(1),
  status: publishStatusSchema.default('DRAFT'),
  caseStudyIds: z.array(objectIdSchema).max(24).default([]),
  testimonialIds: z.array(objectIdSchema).max(24).default([]),
  latestPostIds: z.array(objectIdSchema).max(12).default([]),
  blocks: z.array(pageBlockSchema).max(60).default([]),
  seo: seoSchema,
});

/** Per-page lead form wording and options. Defaults match the most common source page. */


/* --- the remaining section content, modelled from a DOM diff against the originals --- */

export const protectItemSchema = z.object({
  accent: accentSchema,
  icon: iconKey,
  title: shortText.min(1),
  description: longText.default(''),
});

export const marketStatSchema = z.object({
  value: shortText.default(''),
  label: shortText.default(''),
});

export const awardSchema = z.object({
  accent: accentSchema,
  icon: iconKey,
  title: shortText.default(''),
  meta: shortText.default(''),
});

export const awardLeadSchema = z
  .object({
    title: shortText.default(''),
    body: longText.default(''),
    rating: shortText.default(''),
    ratingNote: shortText.default(''),
  })
  .default({});

export const costRowSchema = z.object({
  tier: shortText.default(''),
  tierAccent: accentSchema,
  includes: longText.default(''),
  timeline: shortText.default(''),
  investment: shortText.default(''),
});

export const costTableSchema = z
  .object({
    caption: shortText.default(''),
    headers: z.array(z.string().trim().max(120)).max(8).default([]),
    rows: z.array(costRowSchema).max(12).default([]),
    factorsTitle: shortText.default(''),
    factors: z.array(z.string().trim().max(400)).max(20).default([]),
  })
  .default({});

export const leadReasonSchema = z.object({
  accent: accentSchema,
  icon: iconKey,
  title: shortText.default(''),
  description: longText.default(''),
});

export const officeBlockSchema = z.object({
  label: shortText.default(''),
  lines: z.array(z.string().trim().max(200)).max(8).default([]),
});

export const servicePageSchema = z.object({
  kind: serviceKindSchema,
  slug: slugSchema,
  name: shortText.min(1),
  order: z.number().int().min(0).max(9999).default(0),
  status: publishStatusSchema.default('DRAFT'),

  heroEyebrow: shortText.default(''),
  heroTitle: shortText.min(1),
  heroTitleHighlight: shortText.default(''),
  heroPoints: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  heroCtaLabel: shortText.default(''),
  heroCtaNote: longText.default(''),
  heroDescription: longText.default(''),
  heroImage: mediaRefSchema,
  heroCtas: z.array(ctaLinkSchema).max(4).default([]),
  heroFormTitle: shortText.default(''),
  heroFormSubtitle: longText.default(''),

  valuePropTitle: shortText.default(''),
  valuePropBody: longText.default(''),
  positioningTitle: shortText.default(''),
  positioningBody: longText.default(''),
  positioningImage: mediaRefSchema,

  marketContextTitle: shortText.default(''),
  marketContextBody: longText.default(''),

  sectionLedes: z.record(z.string().trim().max(6000)).default({}),
  brandStripLabel: shortText.default(''),
  logoSlots: z.array(z.string().trim().max(120)).max(24).default([]),
  protectTitle: shortText.default(''),
  protect: z.array(protectItemSchema).max(12).default([]),
  coreCapabilitiesTitle: shortText.default(''),
  coreCapabilities: z.array(z.string().trim().max(400)).max(20).default([]),
  introMediaLabel: shortText.default(''),
  introMediaHint: shortText.default(''),
  marketStats: z.array(marketStatSchema).max(12).default([]),
  statsTitle: shortText.default(''),
  statsNote: longText.default(''),
  stats: z
    .array(z.object({ value: shortText, suffix: z.string().trim().max(12).default(''), label: shortText }))
    .max(12)
    .default([]),
  recognitionTitle: shortText.default(''),
  awardLead: awardLeadSchema,
  awards: z.array(awardSchema).max(16).default([]),
  caseStudiesTitle: shortText.default(''),
  testimonialsTitle: shortText.default(''),
  latestInsightsTitle: shortText.default(''),
  latestInsightsBody: longText.default(''),
  midCta2Title: shortText.default(''),

  servicesTitle: shortText.default(''),
  services: z.array(serviceItemSchema).max(24).default([]),

  solutionsTitle: shortText.default(''),
  solutions: z.array(solutionItemSchema).max(24).default([]),

  featuresTitle: shortText.default(''),
  featuresLayout: z.enum(['chips', 'groups']).default('groups'),
  // Chip-layout pages carry many more entries than the grouped layout — the marketing and
  // SEO pages ship 28 — so the cap is set above the largest real page rather than at a
  // round number that would reject content the site already has.
  features: z.array(featureGroupSchema).max(60).default([]),

  technologiesTitle: shortText.default(''),
  technologies: z.array(technologyItemSchema).max(24).default([]),

  complianceTitle: shortText.default(''),
  compliance: z.array(complianceBadgeSchema).max(16).default([]),

  processTitle: shortText.default(''),
  process: z.array(processStepSchema).max(16).default([]),

  pricingTitle: shortText.default(''),
  pricingBody: longText.default(''),
  costTable: costTableSchema,

  techStackTitle: shortText.default(''),
  techStack: z.array(techStackGroupSchema).max(16).default([]),

  whyTitle: shortText.default(''),
  why: z.array(whyItemSchema).max(16).default([]),

  faqTitle: shortText.default(''),
  faqs: z.array(faqItemSchema).max(40).default([]),

  midCtaTitle: shortText.default(''),
  midCtaBody: longText.default(''),
  midCtaButton: ctaLinkSchema.nullable().default(null),
  midCtaPoints: z.array(z.string().trim().max(400)).max(12).default([]),
  midCta2Body: longText.default(''),
  midCta2Button: ctaLinkSchema.nullable().default(null),
  midCta2Points: z.array(z.string().trim().max(400)).max(12).default([]),
  midCta2Image: mediaRefSchema,
  midCta2MediaLabel: shortText.default(''),
  midCta2MediaHint: shortText.default(''),
  canvasSectionIds: z.array(z.string().trim().max(60)).max(40).default([]),
  centredHeadIds: z.array(z.string().trim().max(60)).max(40).default([]),
  heroDecoration: z.enum(HERO_DECORATIONS).default('none'),
  whyCtaStyle: z.enum(['strip', 'inline']).default('strip'),
  servicesCtaLabel: shortText.default(''),
  solutionsCtaLabel: shortText.default(''),
  costFactorsCtaLabel: shortText.default(''),

  closingCtaTitle: shortText.default(''),
  closingCtaBody: longText.default(''),
  leadReasons: z.array(leadReasonSchema).max(8).default([]),
  leadOffices: z.array(officeBlockSchema).max(8).default([]),
  whyCtaLabel: shortText.default(''),
  faqAfter: longText.default(''),
  faqAfterCtaLabel: shortText.default(''),

  leadForm: leadFormConfigSchema,

  caseStudyIds: z.array(objectIdSchema).max(40).default([]),
  latestPostIds: z.array(objectIdSchema).max(12).default([]),
  testimonialIds: z.array(objectIdSchema).max(40).default([]),

  sectionOrder: z.array(z.string().trim().max(64)).max(60).default([]),
  hiddenSections: z.array(z.string().trim().max(64)).max(60).default([]),

  seo: seoSchema,
});

export const navLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  href: safeHref,
});

export const siteSettingsSchema = z.object({
  companyName: shortText.min(1),
  logo: mediaRefSchema,
  favicon: mediaRefSchema,
  email: z.string().trim().max(200).default(''),
  phone: z.string().trim().max(80).default(''),
  addressLines: z.array(z.string().trim().max(200)).max(10).default([]),
  offices: z
    .array(z.object({ city: shortText, lines: z.array(z.string().trim().max(200)).max(8).default([]) }))
    .max(12)
    .default([]),
  socials: z
    .array(z.object({ label: shortText.min(1), href: safeHref, icon: z.string().trim().max(80).default('') }))
    .max(12)
    .default([]),
  navigation: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        href: safeHref,
        alignRight: z.boolean().optional().default(false),
        columns: z
          .array(
            z.object({
              heading: z.string().trim().max(120).default(''),
              // The swatch beside a mega-menu column heading. An accent token, not a hex,
              // so the menu cannot introduce a colour outside the approved palette.
              accent: accentSchema,
              links: z.array(navLinkSchema).max(24).default([]),
            }),
          )
          .max(8)
          .default([]),
        promoTitle: shortText.optional().default(''),
        promoBody: longText.optional().default(''),
        promoCta: ctaLinkSchema.nullable().optional().default(null),
      }),
    )
    .max(10)
    .default([]),
  mobileNavigation: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        href: safeHref,
        links: z.array(navLinkSchema).max(24).default([]),
      }),
    )
    .max(12)
    .default([]),
  mobileNavCta: ctaLinkSchema.nullable().default(null),
  headerCta: ctaLinkSchema.nullable().default(null),
  footerColumns: z
    .array(
      z.object({
        heading: z.string().trim().max(120).default(''),
        links: z.array(navLinkSchema).max(24).default([]),
        secondaryHeading: z.string().trim().max(120).optional().default(''),
        secondaryLinks: z.array(navLinkSchema).max(24).optional().default([]),
      }),
    )
    .max(8)
    .default([]),
  footerCta: ctaLinkSchema.nullable().default(null),
  footerTagline: longText.default(''),
  legalLinks: z.array(navLinkSchema).max(8).default([]),
  defaultSeo: seoSchema,
  analytics: z
    .object({
      gaMeasurementId: z.string().trim().max(40).default(''),
      gtmContainerId: z.string().trim().max(40).default(''),
      enabled: z.boolean().default(false),
    })
    .default({ gaMeasurementId: '', gtmContainerId: '', enabled: false }),

  /**
   * Who lead mail reaches, and how it signs itself.
   *
   * Addresses may be left empty here — the application falls back to the site's own contact
   * address — so the stricter `emailSettingsSchema` is not reused: that one is for the
   * dedicated email screen, where a blank recipient is a mistake rather than a default.
   * Every address is still checked for the line breaks that would allow header injection.
   */
  emailDelivery: z
    .object({
      notifyTo: optionalEmail,
      notifyCc: emailListSchema.default([]),
      notifyBcc: emailListSchema.default([]),
      senderName: headerSafeText(120).default('AptenTech'),
      replyTo: optionalEmail,
      sendClientConfirmation: z.boolean().default(true),
      sendAdminNotification: z.boolean().default(true),
    })
    .default({
      notifyTo: '',
      notifyCc: [],
      notifyBcc: [],
      senderName: 'AptenTech',
      replyTo: '',
      sendClientConfirmation: true,
      sendAdminNotification: true,
    }),
});

export const publicListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(9),
  category: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(60).optional(),
});

/**
 * The blog list screen's query.
 *
 * `status` is validated against the publish statuses plus `ALL`, the screen's own word for
 * "no filter" — accepting an arbitrary string here would let a crafted query select on a
 * value the collection never stores, and `queryString` exists because Express happily parses
 * `?status[$ne]=DRAFT` into an object.
 */
export const blogListQuerySchema = paginationSchema.extend({
  search: queryString,
  category: queryString,
  status: z.preprocess(
    (v) => (typeof v === 'string' ? v : undefined),
    z.enum(['ALL', ...PUBLISH_STATUSES]).optional(),
  ),
});
