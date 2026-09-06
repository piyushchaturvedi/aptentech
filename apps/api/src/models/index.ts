/**
 * Mongoose models.
 *
 * Collection and index design follows the access patterns the site actually has:
 *  - "fetch one published document by slug"  → unique slug indexes
 *  - "list published documents in order"     → compound {status, order} / {status, publishedAt}
 *  - "triage leads by status, newest first"  → compound {status, createdAt}
 *
 * Page bodies are embedded rather than referenced. A service document carries its own
 * hero, features, process, tech stack and FAQs, so rendering a whole page is one query
 * with no joins and no N+1. The arrays are bounded (the largest in the source content
 * held 12 items), so the 16 MB document ceiling is not a concern. Only genuinely shared
 * many-to-many content — testimonials and case studies — is referenced by id, because the
 * same testimonial appears on several pages and must be edited in one place.
 */
import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import {
  ACCENT_TOKENS,
  ADMIN_ROLES,
  CASE_SHOTS,
  HERO_DECORATIONS,
  LEAD_STATUSES,
  PUBLISH_STATUSES,
  SERVICE_KINDS,
  EMAIL_STATUSES,
  MESSAGE_AUTHORS,
  MESSAGE_KINDS,
  TEMPLATE_KINDS,
} from '@aptentech/shared';
import { LEAD_FORM_TYPES } from '@aptentech/shared';

const opts = { timestamps: true, versionKey: false } as const;

/* ------------------------------------------------------------------ sub-schemas */

const MediaRefSchema = new Schema(
  {
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    legacyPath: { type: String, default: null, maxlength: 512 },
    alt: { type: String, default: '', maxlength: 300 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false },
);

const CtaSchema = new Schema(
  {
    label: { type: String, required: true, maxlength: 120 },
    href: { type: String, required: true, maxlength: 2048 },
    style: { type: String, enum: ['primary', 'mint', 'outline', 'glass'], default: 'primary' },
  },
  { _id: false },
);

const SeoSchema = new Schema(
  {
    title: { type: String, default: '', maxlength: 200 },
    description: { type: String, default: '', maxlength: 400 },
    canonical: { type: String, default: '', maxlength: 2048 },
    ogTitle: { type: String, default: '', maxlength: 200 },
    ogDescription: { type: String, default: '', maxlength: 400 },
    ogImage: { type: MediaRefSchema, default: () => ({}) },
    robotsIndex: { type: Boolean, default: true },
    robotsFollow: { type: Boolean, default: true },
  },
  { _id: false },
);

const accent = { type: String, enum: ACCENT_TOKENS, default: 'indigo' } as const;

const ServiceItemSchema = new Schema(
  {
    accent,
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 6000 },
    icon: { type: String, default: '', maxlength: 64 },
    bullets: { type: [String], default: [] },
  },
  { _id: false },
);

const SolutionItemSchema = new Schema(
  {
    accent,
    title: { type: String, required: true, maxlength: 300 },
    featured: { type: Boolean, default: false },
    icon: { type: String, default: '', maxlength: 64 },
    bullets: { type: [String], default: [] },
  },
  { _id: false },
);

const FeatureGroupSchema = new Schema(
  {
    accent,
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 6000 },
    icon: { type: String, default: '', maxlength: 64 },
    items: { type: [String], default: [] },
  },
  { _id: false },
);

const TechnologyItemSchema = new Schema(
  {
    accent,
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 6000 },
    icon: { type: String, default: '', maxlength: 64 },
  },
  { _id: false },
);

const ComplianceBadgeSchema = new Schema(
  { accent, label: { type: String, required: true, maxlength: 300 }, icon: { type: String, default: '', maxlength: 64 } },
  { _id: false },
);

const ProcessStepSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 6000 },
    deliverables: { type: [String], default: [] },
  },
  { _id: false },
);

const TechStackGroupSchema = new Schema(
  { category: { type: String, required: true, maxlength: 300 }, accent, items: { type: [String], default: [] } },
  { _id: false },
);

const WhyItemSchema = new Schema(
  { title: { type: String, required: true, maxlength: 300 }, description: { type: String, default: '', maxlength: 6000 } },
  { _id: false },
);

const FaqItemSchema = new Schema(
  {
    question: { type: String, required: true, maxlength: 300 },
    answer: { type: String, required: true, maxlength: 6000 },
    category: { type: String, default: '', maxlength: 120 },
    order: { type: Number, default: 0 },
    visible: { type: Boolean, default: true },
  },
  { _id: false },
);

const OfficeSchema = new Schema(
  { city: { type: String, default: '', maxlength: 300 }, lines: { type: [String], default: [] } },
  { _id: false },
);


const ProtectItemSchema = new Schema(
  {
    accent,
    icon: { type: String, default: '', maxlength: 64 },
    title: { type: String, default: '', maxlength: 300 },
    description: { type: String, default: '', maxlength: 6000 },
  },
  { _id: false },
);

const MarketStatSchema = new Schema(
  { value: { type: String, default: '', maxlength: 300 }, label: { type: String, default: '', maxlength: 300 } },
  { _id: false },
);

const AwardSchema = new Schema(
  {
    accent,
    icon: { type: String, default: '', maxlength: 64 },
    title: { type: String, default: '', maxlength: 300 },
    meta: { type: String, default: '', maxlength: 300 },
  },
  { _id: false },
);

const CostRowSchema = new Schema(
  {
    tier: { type: String, default: '', maxlength: 300 },
    tierAccent: { type: String, enum: ACCENT_TOKENS, default: 'indigo' },
    includes: { type: String, default: '', maxlength: 6000 },
    timeline: { type: String, default: '', maxlength: 300 },
    investment: { type: String, default: '', maxlength: 300 },
  },
  { _id: false },
);

const LeadReasonSchema = new Schema(
  {
    accent,
    icon: { type: String, default: '', maxlength: 64 },
    title: { type: String, default: '', maxlength: 300 },
    description: { type: String, default: '', maxlength: 6000 },
  },
  { _id: false },
);

/* ------------------------------------------------------------------ ServicePage */

const ServicePageSchema = new Schema(
  {
    kind: { type: String, enum: SERVICE_KINDS, required: true },
    slug: { type: String, required: true, maxlength: 120 },
    name: { type: String, required: true, maxlength: 300 },
    order: { type: Number, default: 0 },
    status: { type: String, enum: PUBLISH_STATUSES, default: 'DRAFT' },

    heroEyebrow: { type: String, default: '', maxlength: 300 },
    heroTitle: { type: String, required: true, maxlength: 300 },
    heroTitleHighlight: { type: String, default: '', maxlength: 300 },
    heroPoints: { type: [String], default: [] },
    heroCtaLabel: { type: String, default: '', maxlength: 300 },
    heroCtaNote: { type: String, default: '', maxlength: 6000 },
    heroDescription: { type: String, default: '', maxlength: 6000 },
    heroImage: { type: MediaRefSchema, default: () => ({}) },
    heroCtas: { type: [CtaSchema], default: [] },
    heroFormTitle: { type: String, default: '', maxlength: 300 },
    heroFormSubtitle: { type: String, default: '', maxlength: 6000 },

    valuePropTitle: { type: String, default: '', maxlength: 300 },
    valuePropBody: { type: String, default: '', maxlength: 6000 },
    positioningTitle: { type: String, default: '', maxlength: 300 },
    positioningBody: { type: String, default: '', maxlength: 6000 },
    positioningImage: { type: MediaRefSchema, default: () => ({}) },

    marketContextTitle: { type: String, default: '', maxlength: 300 },
    marketContextBody: { type: String, default: '', maxlength: 6000 },

    sectionLedes: { type: Schema.Types.Mixed, default: () => ({}) },
    brandStripLabel: { type: String, default: '', maxlength: 300 },
    logoSlots: { type: [String], default: [] },
    protectTitle: { type: String, default: '', maxlength: 300 },
    protect: { type: [ProtectItemSchema], default: [] },
    coreCapabilitiesTitle: { type: String, default: '', maxlength: 300 },
    coreCapabilities: { type: [String], default: [] },
    introMediaLabel: { type: String, default: '', maxlength: 300 },
    introMediaHint: { type: String, default: '', maxlength: 300 },
    marketStats: { type: [MarketStatSchema], default: [] },
    statsTitle: { type: String, default: '', maxlength: 300 },
    statsNote: { type: String, default: '', maxlength: 6000 },
    stats: {
      type: [new Schema({ value: String, suffix: String, label: String }, { _id: false })],
      default: [],
    },
    recognitionTitle: { type: String, default: '', maxlength: 300 },
    awardLead: {
      type: new Schema({ title: String, body: String, rating: String, ratingNote: String }, { _id: false }),
      default: () => ({}),
    },
    awards: { type: [AwardSchema], default: [] },
    caseStudiesTitle: { type: String, default: '', maxlength: 300 },
    testimonialsTitle: { type: String, default: '', maxlength: 300 },
    latestInsightsTitle: { type: String, default: '', maxlength: 300 },
    latestInsightsBody: { type: String, default: '', maxlength: 6000 },
    midCta2Title: { type: String, default: '', maxlength: 300 },

    servicesTitle: { type: String, default: '', maxlength: 300 },
    services: { type: [ServiceItemSchema], default: [] },

    solutionsTitle: { type: String, default: '', maxlength: 300 },
    solutions: { type: [SolutionItemSchema], default: [] },

    featuresTitle: { type: String, default: '', maxlength: 300 },
    featuresLayout: { type: String, enum: ['chips', 'groups'], default: 'groups' },
    features: { type: [FeatureGroupSchema], default: [] },

    technologiesTitle: { type: String, default: '', maxlength: 300 },
    technologies: { type: [TechnologyItemSchema], default: [] },

    complianceTitle: { type: String, default: '', maxlength: 300 },
    compliance: { type: [ComplianceBadgeSchema], default: [] },

    processTitle: { type: String, default: '', maxlength: 300 },
    process: { type: [ProcessStepSchema], default: [] },

    pricingTitle: { type: String, default: '', maxlength: 300 },
    pricingBody: { type: String, default: '', maxlength: 6000 },
    costTable: {
      type: new Schema(
        {
          caption: { type: String, default: '' },
          headers: { type: [String], default: [] },
          rows: { type: [CostRowSchema], default: [] },
          factorsTitle: { type: String, default: '' },
          factors: { type: [String], default: [] },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    techStackTitle: { type: String, default: '', maxlength: 300 },
    techStack: { type: [TechStackGroupSchema], default: [] },

    whyTitle: { type: String, default: '', maxlength: 300 },
    why: { type: [WhyItemSchema], default: [] },

    faqTitle: { type: String, default: '', maxlength: 300 },
    faqs: { type: [FaqItemSchema], default: [] },

    midCtaTitle: { type: String, default: '', maxlength: 300 },
    midCtaBody: { type: String, default: '', maxlength: 6000 },
    midCtaButton: { type: CtaSchema, default: null },
    midCtaPoints: { type: [String], default: [] },
    midCta2Body: { type: String, default: '', maxlength: 6000 },
    midCta2Button: { type: CtaSchema, default: null },
    midCta2Points: { type: [String], default: [] },
    /**
     * The mid-page CTA illustration.
     *
     * The source wrote only a label and a hint here — the frame was always a placeholder, with
     * no field behind it — so the slot could never be filled from the CMS.
     */
    midCta2Image: { type: MediaRefSchema, default: () => ({}) },
    midCta2MediaLabel: { type: String, default: '', maxlength: 300 },
    midCta2MediaHint: { type: String, default: '', maxlength: 300 },
    canvasSectionIds: { type: [String], default: [] },
    centredHeadIds: { type: [String], default: [] },
    heroDecoration: { type: String, enum: HERO_DECORATIONS, default: 'none' },
    whyCtaStyle: { type: String, enum: ['strip', 'inline'], default: 'strip' },
    servicesCtaLabel: { type: String, default: '', maxlength: 300 },
    solutionsCtaLabel: { type: String, default: '', maxlength: 300 },
    costFactorsCtaLabel: { type: String, default: '', maxlength: 300 },

    closingCtaTitle: { type: String, default: '', maxlength: 300 },
    closingCtaBody: { type: String, default: '', maxlength: 6000 },
    leadReasons: { type: [LeadReasonSchema], default: [] },
    // The lead band's office blocks are labelled ("Headquarters", "Get in touch"), which
    // is not the same field as the site-wide office list's city.
    leadOffices: {
      type: [new Schema({ label: { type: String, default: '', maxlength: 300 }, lines: { type: [String], default: [] } }, { _id: false })],
      default: [],
    },
    whyCtaLabel: { type: String, default: '', maxlength: 300 },
    faqAfter: { type: String, default: '', maxlength: 6000 },
    faqAfterCtaLabel: { type: String, default: '', maxlength: 300 },

    leadForm: {
      type: new Schema(
        {
          title: { type: String, default: 'Get a free consultation', maxlength: 300 },
          submitLabel: { type: String, default: 'Get a Free Consultation', maxlength: 300 },
          serviceLabel: { type: String, default: 'Service required', maxlength: 300 },
          serviceOptions: { type: [String], default: [] },
          budgetLabel: { type: String, default: 'Approximate budget', maxlength: 300 },
          budgetOptions: { type: [String], default: [] },
          budgetNote: { type: String, default: '', maxlength: 6000 },
          detailsLabel: { type: String, default: 'Project details', maxlength: 300 },
          detailsPlaceholder: { type: String, default: '', maxlength: 6000 },
          reassurance: { type: String, default: '', maxlength: 6000 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    caseStudyIds: { type: [Schema.Types.ObjectId], ref: 'CaseStudy', default: [] },
    latestPostIds: { type: [Schema.Types.ObjectId], ref: 'BlogPost', default: [] },
    testimonialIds: { type: [Schema.Types.ObjectId], ref: 'Testimonial', default: [] },

    sectionOrder: { type: [String], default: [] },
    hiddenSections: { type: [String], default: [] },

    seo: { type: SeoSchema, default: () => ({}) },
  },
  opts,
);

// A slug is unique within its family, so /services/seo/ and a hypothetical
// /solutions/seo/ could coexist without colliding.
ServicePageSchema.index({ kind: 1, slug: 1 }, { unique: true });
ServicePageSchema.index({ kind: 1, status: 1, order: 1 });
ServicePageSchema.index({ status: 1, updatedAt: -1 });

/* ------------------------------------------------------------------ SitePage */

const PageBlockSchema = new Schema({}, { _id: false, strict: false });

const SitePageSchema = new Schema(
  {
    slug: { type: String, required: true, maxlength: 120 },
    title: { type: String, required: true, maxlength: 300 },
    status: { type: String, enum: PUBLISH_STATUSES, default: 'DRAFT' },
    // Each page carries the case studies, testimonials and articles written for it rather
    // than a shared set: the copy on the home page is not the copy on the about page.
    caseStudyIds: { type: [Schema.Types.ObjectId], ref: 'CaseStudy', default: [] },
    testimonialIds: { type: [Schema.Types.ObjectId], ref: 'Testimonial', default: [] },
    latestPostIds: { type: [Schema.Types.ObjectId], ref: 'BlogPost', default: [] },
    blocks: { type: [PageBlockSchema], default: [] },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  opts,
);
SitePageSchema.index({ slug: 1 }, { unique: true });

/* ------------------------------------------------------------------ CaseStudy */

const CaseStudySchema = new Schema(
  {
    slug: { type: String, required: true, maxlength: 120 },
    accent,
    industry: { type: String, default: '', maxlength: 300 },
    techSummary: { type: String, default: '', maxlength: 300 },
    tag: { type: String, default: '', maxlength: 300 },
    title: { type: String, required: true, maxlength: 300 },
    problem: { type: String, default: '', maxlength: 6000 },
    solution: { type: String, default: '', maxlength: 6000 },
    result: { type: String, default: '', maxlength: 6000 },
    metrics: {
      type: [new Schema({ value: { type: String, default: '' }, label: { type: String, default: '' } }, { _id: false })],
      default: [],
    },
    shot: { type: String, enum: CASE_SHOTS, default: 'chart' },
    /**
     * Caption under the interface frame.
     *
     * The source hardcoded `[PRODUCT INTERFACE MOCKUP]` into the markup, so it appeared on
     * every case study on 27 pages with no way to change it. Holding it here makes it content
     * like everything else — an editor renames it, or empties it to hide the caption.
     */
    shotCaption: { type: String, default: '', maxlength: 200 },
    /**
     * Marks a record the demo seed created rather than a real one.
     *
     * Read by `npm run preflight`, which blocks a deploy while any of these are still live —
     * they are claims about the company that nobody verified. Declared on the schema because
     * Mongoose silently drops a field the schema does not know, which is how an earlier
     * version of this flag came to be written and never stored.
     */
    demoContent: { type: Boolean, default: false },

    shotConsole: {
      type: new Schema(
        {
          command: { type: String, default: '', maxlength: 300 },
          checks: { type: [String], default: [] },
          summary: { type: String, default: '', maxlength: 300 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    showInIndex: { type: Boolean, default: true },
    detailHref: { type: String, default: null, maxlength: 2048 },
    technologies: { type: [String], default: [] },
    category: { type: String, default: '', maxlength: 300 },
    projectUrl: { type: String, default: '', maxlength: 2048 },
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    status: { type: String, enum: PUBLISH_STATUSES, default: 'DRAFT' },
    images: { type: [MediaRefSchema], default: [] },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  opts,
);
CaseStudySchema.index({ slug: 1 }, { unique: true });
CaseStudySchema.index({ status: 1, featured: -1, order: 1 });
CaseStudySchema.index({ status: 1, category: 1, order: 1 });

/* ------------------------------------------------------------------ Blog */

const BlogCategorySchema = new Schema(
  {
    slug: { type: String, required: true, maxlength: 120 },
    name: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 6000 },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  opts,
);
BlogCategorySchema.index({ slug: 1 }, { unique: true });

const BlogPostSchema = new Schema(
  {
    slug: { type: String, required: true, maxlength: 120 },
    accent,
    title: { type: String, required: true, maxlength: 300 },
    excerpt: { type: String, default: '', maxlength: 6000 },
    body: { type: String, default: '', maxlength: 200_000 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'BlogCategory', default: null },
    categoryName: { type: String, default: '', maxlength: 300 },
    tags: { type: [String], default: [] },
    authorName: { type: String, default: '', maxlength: 300 },
    authorRole: { type: String, default: '', maxlength: 300 },
    authorBio: { type: String, default: '', maxlength: 2000 },
    coverImage: { type: MediaRefSchema, default: () => ({}) },
    readingMinutes: { type: Number, default: 0 },
    status: { type: String, enum: PUBLISH_STATUSES, default: 'DRAFT' },
    publishedAt: { type: Date, default: null },
    faqs: { type: [FaqItemSchema], default: [] },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  opts,
);
BlogPostSchema.index({ slug: 1 }, { unique: true });
BlogPostSchema.index({ status: 1, publishedAt: -1 });
BlogPostSchema.index({ status: 1, categoryId: 1, publishedAt: -1 });
BlogPostSchema.index({ status: 1, tags: 1, publishedAt: -1 });
// Powers admin search without a collection scan.
BlogPostSchema.index({ title: 'text', excerpt: 'text' }, { name: 'blog_text', weights: { title: 5, excerpt: 1 } });

/* ------------------------------------------------------------------ Testimonial / FAQ */

const TestimonialSchema = new Schema(
  {
    /**
     * Where this testimonial came from in the source, as `<page>#<index>`.
     *
     * The seed keys on this rather than on the name and quote, which are exactly the fields
     * an editor — or the demo-content pass — is expected to rewrite. Keying on mutable text
     * meant the next seed no longer recognised the record and inserted a second copy.
     */
    /**
     * Marks a record the demo seed created rather than a real one.
     *
     * Read by `npm run preflight`, which blocks a deploy while any of these are still live —
     * they are claims about the company that nobody verified. Declared on the schema because
     * Mongoose silently drops a field the schema does not know, which is how an earlier
     * version of this flag came to be written and never stored.
     */
    demoContent: { type: Boolean, default: false },
    sourceKey: { type: String, default: null, maxlength: 160 },
    name: { type: String, required: true, maxlength: 300 },
    designation: { type: String, default: '', maxlength: 300 },
    company: { type: String, default: '', maxlength: 300 },
    content: { type: String, required: true, maxlength: 6000 },
    industry: { type: String, default: '', maxlength: 300 },
    duration: { type: String, default: '', maxlength: 300 },
    rating: { type: Number, default: null, min: 0, max: 5 },
    photo: { type: MediaRefSchema, default: () => ({}) },
    attachedTo: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    visible: { type: Boolean, default: true },
  },
  opts,
);
TestimonialSchema.index({ visible: 1, order: 1 });
TestimonialSchema.index({ attachedTo: 1, visible: 1 });

const FaqSchema = new Schema(
  {
    question: { type: String, required: true, maxlength: 300 },
    answer: { type: String, required: true, maxlength: 6000 },
    category: { type: String, default: '', maxlength: 120 },
    attachedTo: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    visible: { type: Boolean, default: true },
  },
  opts,
);
FaqSchema.index({ attachedTo: 1, visible: 1, order: 1 });
FaqSchema.index({ visible: 1, order: 1 });

/* ------------------------------------------------------------------ Lead */

const LeadNoteSchema = new Schema(
  {
    body: { type: String, required: true, maxlength: 4000 },
    authorId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    authorName: { type: String, default: '', maxlength: 200 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const LeadSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, maxlength: 200, lowercase: true, trim: true },
    phone: { type: String, default: null, maxlength: 40 },
    dialCode: { type: String, default: null, maxlength: 8 },
    company: { type: String, default: null, maxlength: 160 },

    service: { type: String, default: null, maxlength: 160 },
    budget: { type: String, default: null, maxlength: 80 },
    message: { type: String, default: '', maxlength: 5000 },
    ndaRequested: { type: Boolean, default: false },
    attachment: {
      type: new Schema(
        {
          mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
          filename: String,
          mimeType: String,
          bytes: Number,
        },
        { _id: false },
      ),
      default: null,
    },

    sourcePage: { type: String, default: '/', maxlength: 512 },
    sourceForm: { type: String, enum: LEAD_FORM_TYPES, required: true },
    referrer: { type: String, default: null, maxlength: 2048 },
    utm: {
      type: new Schema(
        {
          source: { type: String, default: null, maxlength: 200 },
          medium: { type: String, default: null, maxlength: 200 },
          campaign: { type: String, default: null, maxlength: 200 },
          term: { type: String, default: null, maxlength: 200 },
          content: { type: String, default: null, maxlength: 200 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    status: { type: String, enum: LEAD_STATUSES, default: 'NEW' },
    notes: { type: [LeadNoteSchema], default: [] },
    spamScore: { type: Number, default: 0 },
    spamReasons: { type: [String], default: [] },

    /**
     * Salted hash of the submitter IP, never the address itself. Enough to rate-limit and
     * spot duplicates, but not personal data retained in the clear.
     */
    ipHash: { type: String, default: null, maxlength: 64, select: false },
    /** Hash of name+email+message, used to collapse repeat submissions. */
    fingerprint: { type: String, default: null, maxlength: 64, select: false },
  },
  opts,
);
LeadSchema.index({ status: 1, createdAt: -1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ email: 1, createdAt: -1 });
LeadSchema.index({ fingerprint: 1, createdAt: -1 });

/* ------------------------------------------------------------------ Admin / session */

const AdminUserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    name: { type: String, required: true, maxlength: 120 },
    // `select: false` keeps the hash out of every query result unless explicitly asked for.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, default: 'EDITOR' },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    failedAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
  },
  opts,
);
AdminUserSchema.index({ email: 1 }, { unique: true });

const SessionSchema = new Schema(
  {
    // Only the hash of the session token is stored: a database leak does not hand an
    // attacker usable sessions.
    tokenHash: { type: String, required: true, maxlength: 64 },
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    csrfToken: { type: String, required: true, maxlength: 64 },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    ip: { type: String, default: null, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 400 },
  },
  { timestamps: true, versionKey: false },
);
SessionSchema.index({ tokenHash: 1 }, { unique: true });
SessionSchema.index({ adminId: 1 });
// Mongo removes expired sessions automatically; no cleanup job required.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/* ------------------------------------------------------------------ Media / redirects / audit */

const MediaSchema = new Schema(
  {
    key: { type: String, required: true, maxlength: 512 },
    filename: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 120 },
    bytes: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    alt: { type: String, default: '', maxlength: 300 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  opts,
);
MediaSchema.index({ key: 1 }, { unique: true });
MediaSchema.index({ createdAt: -1 });
MediaSchema.index({ filename: 'text', alt: 'text' }, { name: 'media_text' });

const RedirectSchema = new Schema(
  {
    from: { type: String, required: true, maxlength: 512 },
    to: { type: String, required: true, maxlength: 2048 },
    statusCode: { type: Number, default: 301, enum: [301, 302, 307, 308] },
    active: { type: Boolean, default: true },
  },
  opts,
);
RedirectSchema.index({ from: 1 }, { unique: true });

const AuditLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    adminEmail: { type: String, default: '', maxlength: 200 },
    action: { type: String, required: true, maxlength: 80 },
    entity: { type: String, required: true, maxlength: 80 },
    entityId: { type: String, default: null, maxlength: 64 },
    result: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS' },
    ip: { type: String, default: null, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ adminId: 1, createdAt: -1 });
// Audit history is kept for a year, then expires on its own.
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

/* ------------------------------------------------------------------ SiteSettings */

const SiteSettingsSchema = new Schema(
  {
    singleton: { type: String, default: 'site', immutable: true },
    companyName: { type: String, default: 'Aptentech', maxlength: 300 },
    logo: { type: MediaRefSchema, default: () => ({}) },
    favicon: { type: MediaRefSchema, default: () => ({}) },
    email: { type: String, default: '', maxlength: 200 },
    phone: { type: String, default: '', maxlength: 80 },
    addressLines: { type: [String], default: [] },
    offices: { type: [OfficeSchema], default: [] },
    socials: {
      type: [new Schema({ label: String, href: String, icon: String }, { _id: false })],
      default: [],
    },
    navigation: { type: [new Schema({}, { _id: false, strict: false })], default: [] },
    // The mobile menu is its own list in the source, not a projection of the desktop one.
    mobileNavigation: { type: [new Schema({}, { _id: false, strict: false })], default: [] },
    mobileNavCta: { type: CtaSchema, default: null },
    headerCta: { type: CtaSchema, default: null },
    footerColumns: { type: [new Schema({}, { _id: false, strict: false })], default: [] },
    footerCta: { type: CtaSchema, default: null },
    footerTagline: { type: String, default: '', maxlength: 6000 },
    legalLinks: { type: [new Schema({ label: String, href: String }, { _id: false })], default: [] },
    defaultSeo: { type: SeoSchema, default: () => ({}) },
    /**
     * Who lead mail reaches, and how it signs itself.
     *
     * Recipients and wording are content, so they belong to the administrator. The provider
     * credentials and the envelope sender are deliberately absent: those stay in server
     * configuration, because the CMS is reachable by more people than the server is.
     */
    emailDelivery: {
      type: new Schema(
        {
          notifyTo: { type: String, default: '', maxlength: 200 },
          notifyCc: { type: [String], default: [] },
          notifyBcc: { type: [String], default: [] },
          senderName: { type: String, default: 'AptenTech', maxlength: 120 },
          replyTo: { type: String, default: '', maxlength: 200 },
          sendClientConfirmation: { type: Boolean, default: true },
          sendAdminNotification: { type: Boolean, default: true },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    analytics: {
      type: new Schema(
        {
          gaMeasurementId: { type: String, default: '', maxlength: 40 },
          gtmContainerId: { type: String, default: '', maxlength: 40 },
          enabled: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  opts,
);
SiteSettingsSchema.index({ singleton: 1 }, { unique: true });

/* ------------------------------------------------------------------ email + conversations */

const EmailAttemptSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    status: { type: String, enum: EMAIL_STATUSES, required: true },
    error: { type: String, default: null, maxlength: 1000 },
  },
  { _id: false },
);

/**
 * One message on a lead's thread.
 *
 * Messages are embedded in the conversation rather than kept in their own collection: a
 * thread is always read whole, is bounded in practice by how much correspondence one
 * enquiry attracts, and embedding means the admin's lead view is a single query.
 *
 * The threading headers are stored because they are the only reliable way to recognise a
 * client's reply later. Subject matching is a guess; `In-Reply-To` is an identifier the
 * client's mail program echoes back.
 */
const ConversationMessageSchema = new Schema(
  {
    author: { type: String, enum: MESSAGE_AUTHORS, required: true },
    kind: { type: String, enum: MESSAGE_KINDS, required: true },
    authorName: { type: String, default: '', maxlength: 200 },
    authorEmail: { type: String, default: '', maxlength: 320 },
    subject: { type: String, default: '', maxlength: 400 },
    /** Sanitised before it is written; never re-sanitised on read. */
    html: { type: String, default: '', maxlength: 200_000 },
    text: { type: String, default: '', maxlength: 200_000 },
    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    status: { type: String, enum: EMAIL_STATUSES, default: 'QUEUED' },
    messageId: { type: String, default: null, maxlength: 400 },
    inReplyTo: { type: String, default: null, maxlength: 400 },
    references: { type: [String], default: [] },
    attempts: { type: [EmailAttemptSchema], default: [] },
    lastError: { type: String, default: null, maxlength: 1000 },
    /** The provider's own id, so a delivery can be traced in their console. */
    providerId: { type: String, default: null, maxlength: 200 },
    sentAt: { type: Date, default: null },
    /**
     * Idempotency key. A unique sparse index cannot be used inside an array, so uniqueness
     * is enforced by the service checking for the key before appending — which is enough,
     * because a single conversation's writes are serialised by the document lock.
     */
    dedupeKey: { type: String, default: null, maxlength: 64 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const ConversationSchema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    subject: { type: String, default: '', maxlength: 400 },
    messages: { type: [ConversationMessageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now },
  },
  opts,
);
// One conversation per lead — the whole point of the thread is that there is only one.
ConversationSchema.index({ leadId: 1 }, { unique: true });
ConversationSchema.index({ lastMessageAt: -1 });
/**
 * Finds the thread an inbound reply belongs to.
 *
 * Sparse because most messages have no `messageId` until they are actually sent, and a
 * non-sparse index would store a null entry for every one of them.
 */
ConversationSchema.index({ 'messages.messageId': 1 }, { sparse: true });

const EmailTemplateSchema = new Schema(
  {
    kind: { type: String, enum: TEMPLATE_KINDS, required: true },
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 400 },
    subject: { type: String, required: true, maxlength: 300 },
    html: { type: String, required: true, maxlength: 60_000 },
    text: { type: String, default: '', maxlength: 30_000 },
    active: { type: Boolean, default: true },
    /** Built-in templates fill a slot the application sends from; they may be edited, not deleted. */
    builtIn: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  opts,
);
EmailTemplateSchema.index({ kind: 1, active: 1 });

/**
 * Inbound mail that could not be matched to a thread.
 *
 * Kept rather than dropped: an unanswered client reply is worse than an untidy queue, and
 * attaching it to the wrong lead would put one client's words in another's history.
 */
const UnmatchedInboundSchema = new Schema(
  {
    fromEmail: { type: String, default: '', maxlength: 320 },
    fromName: { type: String, default: '', maxlength: 200 },
    subject: { type: String, default: '', maxlength: 400 },
    text: { type: String, default: '', maxlength: 200_000 },
    html: { type: String, default: '', maxlength: 200_000 },
    messageId: { type: String, default: null, maxlength: 400 },
    inReplyTo: { type: String, default: null, maxlength: 400 },
    references: { type: [String], default: [] },
    reason: { type: String, default: '', maxlength: 200 },
    resolved: { type: Boolean, default: false },
    resolvedLeadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
  },
  opts,
);
UnmatchedInboundSchema.index({ resolved: 1, createdAt: -1 });
// Providers retry webhooks; the same message must not be recorded twice.
UnmatchedInboundSchema.index({ messageId: 1 }, { unique: true, sparse: true });

/* ------------------------------------------------------------------ exports */

function build<T extends Schema>(name: string, schema: T): Model<InferSchemaType<T>> {
  return (models[name] as Model<InferSchemaType<T>>) ?? model<InferSchemaType<T>>(name, schema);
}

export const ServicePageModel = build('ServicePage', ServicePageSchema);
export const SitePageModel = build('SitePage', SitePageSchema);
export const CaseStudyModel = build('CaseStudy', CaseStudySchema);
export const BlogPostModel = build('BlogPost', BlogPostSchema);
export const BlogCategoryModel = build('BlogCategory', BlogCategorySchema);
export const TestimonialModel = build('Testimonial', TestimonialSchema);
export const FaqModel = build('Faq', FaqSchema);
export const LeadModel = build('Lead', LeadSchema);
export const AdminUserModel = build('AdminUser', AdminUserSchema);
export const SessionModel = build('Session', SessionSchema);
export const MediaModel = build('Media', MediaSchema);
export const RedirectModel = build('Redirect', RedirectSchema);
export const AuditLogModel = build('AuditLog', AuditLogSchema);
export const SiteSettingsModel = build('SiteSettings', SiteSettingsSchema);
export const ConversationModel = build('Conversation', ConversationSchema);
export const EmailTemplateModel = build('EmailTemplate', EmailTemplateSchema);
export const UnmatchedInboundModel = build('UnmatchedInbound', UnmatchedInboundSchema);

/** Called once at boot so index creation failures surface immediately, not on first query. */
export async function syncIndexes(): Promise<void> {
  await Promise.all([
    ServicePageModel.syncIndexes(),
    SitePageModel.syncIndexes(),
    CaseStudyModel.syncIndexes(),
    BlogPostModel.syncIndexes(),
    BlogCategoryModel.syncIndexes(),
    TestimonialModel.syncIndexes(),
    FaqModel.syncIndexes(),
    LeadModel.syncIndexes(),
    AdminUserModel.syncIndexes(),
    SessionModel.syncIndexes(),
    MediaModel.syncIndexes(),
    RedirectModel.syncIndexes(),
    AuditLogModel.syncIndexes(),
    SiteSettingsModel.syncIndexes(),
    ConversationModel.syncIndexes(),
    EmailTemplateModel.syncIndexes(),
    UnmatchedInboundModel.syncIndexes(),
  ]);
}
