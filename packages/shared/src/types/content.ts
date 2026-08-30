/**
 * Content types.
 *
 * Every shape here was derived from the data structures actually found in the source
 * HTML during the Phase 1 audit — the `SERVICES`, `SOL`, `CASES`, `FEATURES`, `AI`,
 * `BADGES`, `STEPS`, `TECH`, `WHY`, `FAQ` and `POSTS` arrays that the original pages
 * rendered client-side with `innerHTML`. Nothing is invented; the field set matches what
 * the approved design already renders, which is what makes pixel parity achievable while
 * the content becomes CMS-driven and server-rendered.
 */

import type { AccentToken, CtaLink, MediaRef, PublishStatus, SeoFields, ServiceKind } from './primitives';
import type {
  Award,
  AwardLead,
  CostTable,
  LeadReason,
  MarketStat,
  OfficeBlock,
  ProtectItem,
  SectionLedes,
} from './servicePageSections';

/** Source: `SERVICES` — the services nav + combined detail panel. */
export interface ServiceItem {
  accent: AccentToken;
  title: string;
  description: string;
  icon: string;
  bullets: string[];
}

/** Source: `SOL` — the solutions bento grid. `featured` drove the wide tile. */
export interface SolutionItem {
  accent: AccentToken;
  title: string;
  featured: boolean;
  icon: string;
  bullets: string[];
}

/** Source: `FEATURES` — tabbed feature groups, 9 visible then "show all". */
export interface FeatureGroup {
  accent: AccentToken;
  title: string;
  description: string;
  icon: string;
  items: string[];
}

/** Source: `AI` — the "future-ready technologies" grid. */
export interface TechnologyItem {
  accent: AccentToken;
  title: string;
  description: string;
  icon: string;
}

/** Source: `BADGES` — compliance/standards row. */
export interface ComplianceBadge {
  accent: AccentToken;
  label: string;
  icon: string;
}

/** Source: `STEPS` — the process timeline; `deliverables` were the chips under each step. */
export interface ProcessStep {
  title: string;
  description: string;
  deliverables: string[];
}

/** Source: `TECH` — tabbed tech-stack groups. */
export interface TechStackGroup {
  category: string;
  accent: AccentToken;
  items: string[];
}

/** Source: `WHY` — the numbered "why Aptentech" list. */
export interface WhyItem {
  title: string;
  description: string;
}

/** Source: `FAQ` — `[question, answer]` pairs. Answers may contain inline markup. */
export interface FaqItem {
  id?: string;
  question: string;
  answer: string;
  category?: string;
  order?: number;
  visible?: boolean;
}

/** Source: `CASES` — one card in the case-study carousel / portfolio grid. */
export interface CaseStudyMetric {
  value: string;
  label: string;
}

/** The lines drawn inside the carousel's faux terminal. */
export interface CaseShotConsole {
  command: string;
  checks: string[];
  summary: string;
}

/** The three faux-UI illustrations the carousel drew in CSS. Design-controlled. */
export const CASE_SHOTS = ['chart', 'cells', 'code'] as const;
export type CaseShot = (typeof CASE_SHOTS)[number];

export interface CaseStudy {
  id: string;
  slug: string;
  accent: AccentToken;
  industry: string;
  techSummary: string;
  tag: string;
  title: string;
  problem: string;
  solution: string;
  result: string;
  metrics: CaseStudyMetric[];
  shot: CaseShot;
  /** Copy for the faux console in the `code` illustration. Decorative, but page-specific. */
  shotConsole: CaseShotConsole;
  detailHref: string | null;
  technologies: string[];
  category: string;
  projectUrl: string;
  featured: boolean;
  /** Whether this appears on the /case-studies/ index, as opposed to only on a page carousel. */
  showInIndex: boolean;
  order: number;
  status: PublishStatus;
  images: MediaRef[];
  seo: SeoFields;
  createdAt?: string;
  updatedAt?: string;
}

/** Source: `POSTS` on the blog listing. */
export interface BlogPostSummary {
  id: string;
  slug: string;
  accent: AccentToken;
  categoryName: string;
  title: string;
  excerpt: string;
  authorName: string;
  publishedAt: string | null;
  coverImage: MediaRef;
  readingMinutes: number;
}

export interface BlogPost extends BlogPostSummary {
  body: string;
  categoryId: string | null;
  tags: string[];
  status: PublishStatus;
  faqs: FaqItem[];
  seo: SeoFields;
  createdAt?: string;
  updatedAt?: string;
}

export interface BlogCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  seo: SeoFields;
}

export interface Testimonial {
  id: string;
  name: string;
  designation: string;
  company: string;
  content: string;
  /** Source: the `Industry:` chip in the `.tst-meta` row. Placeholder text is kept verbatim. */
  industry: string;
  /** Source: the `Duration:` chip in the same row. */
  duration: string;
  rating: number | null;
  photo: MediaRef;
  attachedTo: string[];
  order: number;
  visible: boolean;
}

/**
 * A service or solution page.
 *
 * Services and solutions share one document shape because the audit measured their
 * stylesheets as 96–100% identical and their section order as the same 21–22 blocks.
 * `kind` decides the URL prefix (`/services/` vs `/solutions/`) and nothing else, so one
 * renderer and one admin form serve all 17 pages without duplicating a component.
 * Optional sections (`marketContext`, `features`) are simply absent on pages that never
 * had them, which preserves the real differences between the two families.
 */
export interface ServicePage {
  id: string;
  kind: ServiceKind;
  slug: string;
  name: string;
  order: number;
  status: PublishStatus;

  heroEyebrow: string;
  heroTitle: string;
  /** The tail of the H1 the design renders in a gradient (<span class="g">). */
  heroTitleHighlight: string;
  heroDescription: string;
  /** The tick-list beside the hero on service and solution pages. */
  heroPoints: string[];
  heroCtaLabel: string;
  heroCtaNote: string;
  heroImage: MediaRef;
  heroCtas: CtaLink[];
  /** Heading and standfirst above the inline hero form. */
  heroFormTitle: string;
  heroFormSubtitle: string;

  valuePropTitle: string;
  valuePropBody: string;
  positioningTitle: string;
  positioningBody: string;
  positioningImage: MediaRef;

  marketContextTitle: string;
  marketContextBody: string;

  /** Standfirst copy for every band, keyed by section. */
  sectionLedes: SectionLedes;

  /** The client and partner logo marquee under the hero. */
  brandStripLabel: string;
  logoSlots: string[];

  /** The numbered band that follows the marquee. */
  protectTitle: string;
  protect: ProtectItem[];

  /** The intro band's capability list and image-frame labels. */
  coreCapabilitiesTitle: string;
  coreCapabilities: string[];
  introMediaLabel: string;
  introMediaHint: string;

  /** Market-context tiles. Solution pages only. */
  marketStats: MarketStat[];

  statsTitle: string;
  statsNote: string;
  stats: StatItem[];
  recognitionTitle: string;
  awardLead: AwardLead;
  awards: Award[];
  caseStudiesTitle: string;
  testimonialsTitle: string;
  latestInsightsTitle: string;
  latestInsightsBody: string;
  midCta2Title: string;

  servicesTitle: string;
  services: ServiceItem[];

  solutionsTitle: string;
  solutions: SolutionItem[];

  featuresTitle: string;
  /** Chips (service pages) vs grouped cards (solution pages) — different source layouts. */
  featuresLayout: 'chips' | 'groups';
  features: FeatureGroup[];

  technologiesTitle: string;
  technologies: TechnologyItem[];

  complianceTitle: string;
  compliance: ComplianceBadge[];

  processTitle: string;
  process: ProcessStep[];

  pricingTitle: string;
  pricingBody: string;
  costTable: CostTable;

  techStackTitle: string;
  techStack: TechStackGroup[];

  whyTitle: string;
  why: WhyItem[];

  faqTitle: string;
  faqs: FaqItem[];

  midCtaTitle: string;
  midCtaBody: string;
  midCtaButton: CtaLink | null;
  midCtaPoints: string[];
  midCta2Body: string;
  midCta2Button: CtaLink | null;
  midCta2Points: string[];
  /** Labels inside the second CTA strip's image frame, kept from the source placeholder. */
  midCta2MediaLabel: string;
  midCta2MediaHint: string;
  /** Button under the solutions bento (`.cc-cta > .btn-lg`). */
  solutionsCtaLabel: string;
  /** Button at the end of the "what moves the number" list. */
  costFactorsCtaLabel: string;

  closingCtaTitle: string;
  closingCtaBody: string;
  leadReasons: LeadReason[];
  leadOffices: OfficeBlock[];
  whyCtaLabel: string;
  faqAfter: string;
  faqAfterCtaLabel: string;

  leadForm: LeadFormConfig;

  caseStudyIds: string[];
  testimonialIds: string[];

  /** Section visibility + order. Editors may hide or reorder, never invent a section. */
  sectionOrder: string[];
  hiddenSections: string[];

  seo: SeoFields;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Per-page lead form configuration.
 *
 * The design uses one form component, but its labels, options and helper text differ from
 * page to page — the SEO page asks for a "Monthly SEO budget" with its own ranges and
 * submits "Get my free SEO audit", while a solution page asks for an "Approximate
 * budget". Holding those strings here keeps a single component while preserving every
 * page's exact wording, and lets an admin change any of it.
 */
export interface LeadFormConfig {
  title: string;
  submitLabel: string;
  serviceLabel: string;
  serviceOptions: string[];
  budgetLabel: string;
  budgetOptions: string[];
  budgetNote: string;
  detailsLabel: string;
  detailsPlaceholder: string;
  reassurance: string;
}

/** A statically-routed page (home, about, contact, legal). */
export interface SitePage {
  id: string;
  slug: string;
  title: string;
  status: PublishStatus;
  blocks: PageBlock[];
  seo: SeoFields;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Page blocks are a closed, typed set. There is deliberately no free-form HTML block and
 * no general page builder: an editor picks from these and fills their fields, so no CMS
 * edit can produce markup the stylesheet does not already cover.
 */
export const BLOCK_TYPES = [
  'hero',
  'textSection',
  'imageText',
  'featureGrid',
  'serviceGrid',
  'solutionsBento',
  'portfolioGrid',
  'technologySection',
  'processSection',
  'statsBar',
  'complianceBadges',
  'testimonialSection',
  'faqSection',
  'ctaSection',
  'blogSection',
  'leadFormSection',
  'richText',
  'legalSection',
  'officeGrid',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface BaseBlock {
  key: string;
  type: BlockType;
  enabled: boolean;
  eyebrow?: string;
  title?: string;
  body?: string;
}

export interface HeroBlock extends BaseBlock {
  type: 'hero';
  ctas: CtaLink[];
  image: MediaRef;
  onDark: boolean;
}

export interface StatItem {
  value: string;
  suffix: string;
  label: string;
}

export interface StatsBarBlock extends BaseBlock {
  type: 'statsBar';
  stats: StatItem[];
}

export interface ServiceGridBlock extends BaseBlock {
  type: 'serviceGrid';
  items: ServiceItem[];
}

export interface FeatureGridBlock extends BaseBlock {
  type: 'featureGrid';
  items: FeatureGroup[];
}

export interface SolutionsBentoBlock extends BaseBlock {
  type: 'solutionsBento';
  items: SolutionItem[];
}

export interface TechnologyBlock extends BaseBlock {
  type: 'technologySection';
  items: TechnologyItem[];
}

export interface ProcessBlock extends BaseBlock {
  type: 'processSection';
  steps: ProcessStep[];
}

export interface ComplianceBlock extends BaseBlock {
  type: 'complianceBadges';
  badges: ComplianceBadge[];
}

export interface FaqBlock extends BaseBlock {
  type: 'faqSection';
  faqs: FaqItem[];
  emitSchema: boolean;
}

export interface CtaBlock extends BaseBlock {
  type: 'ctaSection';
  ctas: CtaLink[];
  onDark: boolean;
  image: MediaRef;
}

export interface TextBlock extends BaseBlock {
  type: 'textSection' | 'richText' | 'legalSection';
  html: string;
}

export interface ImageTextBlock extends BaseBlock {
  type: 'imageText';
  image: MediaRef;
  imageSide: 'left' | 'right';
  bullets: string[];
  ctas: CtaLink[];
}

export interface OfficeItem {
  city: string;
  lines: string[];
}

export interface OfficeGridBlock extends BaseBlock {
  type: 'officeGrid';
  offices: OfficeItem[];
}

export interface CollectionBlock extends BaseBlock {
  type: 'portfolioGrid' | 'testimonialSection' | 'blogSection' | 'leadFormSection';
  limit: number;
  submitLabel?: string;
  serviceOptions?: string[];
}

export type PageBlock =
  | HeroBlock
  | StatsBarBlock
  | ServiceGridBlock
  | FeatureGridBlock
  | SolutionsBentoBlock
  | TechnologyBlock
  | ProcessBlock
  | ComplianceBlock
  | FaqBlock
  | CtaBlock
  | TextBlock
  | ImageTextBlock
  | OfficeGridBlock
  | CollectionBlock;

/** Navigation is CMS-managed so the mega-menu can be repointed without a deploy. */
export interface NavLink {
  label: string;
  href: string;
}

export interface NavColumn {
  heading: string;
  /** Colour of the swatch beside the column heading in the mega-menu. */
  accent: AccentToken;
  links: NavLink[];
}

export interface NavGroup {
  label: string;
  href: string;
  /** The source gives the last mega-panel a `right` modifier so it cannot overflow the viewport. */
  alignRight?: boolean;
  columns: NavColumn[];
  promoTitle?: string;
  promoBody?: string;
  /** Null when the menu group has no promo tile — the schema stores null, not absent. */
  promoCta?: CtaLink | null;
}

export interface FooterColumn {
  heading: string;
  links: NavLink[];
  /** The source's Industries column carries a second labelled list ("Resources") in the same nav. */
  secondaryHeading?: string;
  secondaryLinks?: NavLink[];
}

/** A social profile. `icon` is a key into the generated icon registry, never raw SVG. */
export interface SocialLink {
  label: string;
  href: string;
  icon: string;
}

/**
 * One entry in the mobile menu.
 *
 * The source ships a mobile list that is deliberately not the desktop menu: it exposes two
 * expandable groups and five direct links, so it is stored separately rather than derived.
 */
export interface MobileNavItem {
  label: string;
  href: string;
  links: NavLink[];
}

export interface SiteSettings {
  id: string;
  companyName: string;
  logo: MediaRef;
  favicon: MediaRef;
  email: string;
  phone: string;
  addressLines: string[];
  offices: OfficeItem[];
  socials: SocialLink[];
  navigation: NavGroup[];
  mobileNavigation: MobileNavItem[];
  mobileNavCta: CtaLink | null;
  headerCta: CtaLink | null;
  footerColumns: FooterColumn[];
  footerCta: CtaLink | null;
  footerTagline: string;
  legalLinks: NavLink[];
  defaultSeo: SeoFields;
  analytics: {
    gaMeasurementId: string;
    gtmContainerId: string;
    enabled: boolean;
  };
  updatedAt?: string;
}
