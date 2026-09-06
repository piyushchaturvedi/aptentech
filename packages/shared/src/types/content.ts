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
/**
 * A capability in the "future-ready technologies" band.
 *
 * The home page's version of this band adds an outcome line under the description; the
 * service pages' does not, so the field is optional rather than invented for them.
 */
export interface TechnologyItem {
  accent: AccentToken;
  title: string;
  description: string;
  /** The home page prints an outcome line under the description; other pages do not. */
  outcome?: string;
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

/** Hero overlays available to a page. Design-controlled, so the set is closed. */
export const HERO_DECORATIONS = ['none', 'hearts'] as const;
export type HeroDecoration = (typeof HERO_DECORATIONS)[number];

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
  /** Caption under the interface frame; empty hides it. */
  shotCaption: string;
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
  /** The byline's second line. The article template prints it under the author's name. */
  authorRole: string;
  /** One or two sentences under the author box, establishing why they are credible here. */
  authorBio: string;
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
  midCta2Image: MediaRef;
  midCta2MediaLabel: string;
  midCta2MediaHint: string;
  /** Button under the solutions bento (`.cc-cta > .btn-lg`). */
  /**
   * DOM ids of the sections this page renders on the tinted `.canvas` background.
   *
   * The source alternates the banding down the page, so it depends on which sections a
   * given page has rather than on the section itself.
   */
  canvasSectionIds: string[];
  /** DOM ids of the sections whose heading block is centred (`.sect-head.center`). */
  centredHeadIds: string[];
  /**
   * A decorative hero overlay. A closed set, because it is design: the dating page floats
   * hearts behind its hero and no other page has an overlay at all.
   */
  heroDecoration: HeroDecoration;
  /**
   * How the "why" band's button is laid out. Sixteen pages use the full-width strip; the
   * dating page places the button inline under the standfirst.
   */
  whyCtaStyle: 'strip' | 'inline';
  /** Button under the services panel. Only the dating page carries one. */
  servicesCtaLabel: string;
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
  /** Articles the page's "latest insights" band links; page-specific in the source. */
  latestPostIds: string[];
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
  /**
   * Case studies this page's carousel shows.
   *
   * The home page carries five of its own rather than the index's eight, so it references
   * them here; a page that leaves this empty falls back to the published index.
   */
  caseStudyIds?: string[];
  /** Testimonials this page shows. The home and about pages each carry their own three. */
  testimonialIds?: string[];
  /** Articles the page's "latest insights" band links. */
  latestPostIds?: string[];
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
  'legalDocument',
  'contactBanner',
  'portfolioHero',
  'blogHero',
  'pageIndex',
  'articleTemplate',
  'aboutHero',
  'homeHero',
  'statsPanel',
  'storyBand',
  'valueGrid',
  'principleList',
  'brandStrip',
  'awardsBand',
  'whyGrid',
  'serviceTabs',
  'caseCarousel',
  'techTabs',
  'aiGrid',
  'faqShell',
  'latestInsights',
  'caseStudyList',
  'stepGrid',
  'routeGrid',
  'officeCards',
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

/** One numbered clause in a legal document, used to build the table of contents. */
export interface LegalClause {
  id: string;
  number: string;
  title: string;
}

/**
 * A legal document — privacy policy, terms.
 *
 * The body is kept as one sanitised HTML string because the clauses nest lists, cards and
 * sub-headings that the source styles as a whole; splitting it into fields would have
 * meant rebuilding that markup rather than preserving it. `clauses` mirrors the section
 * anchors so the table of contents can be rendered on the server.
 */
export interface LegalDocumentBlock extends BaseBlock {
  type: 'legalDocument';
  heading: string;
  /** The dated lines under the heading; still `[DATE]` placeholders until an admin sets them. */
  meta: string[];
  /** The pre-publication review notice. Cleared in the CMS when the document goes live. */
  notice: string;
  tocLabel: string;
  bodyHtml: string;
  clauses: LegalClause[];
}

/** A numbered card in the contact page's "what happens after you hit send" band. */
export interface StepCard {
  number: string;
  title: string;
  description: string;
  accent: AccentToken;
}

/** One of the contact page's four routes to a person. */
export interface ContactRoute {
  accent: AccentToken;
  icon: string;
  title: string;
  description: string;
  linkLabel: string;
  href: string;
}

/** An office card: a kind label, a city, an address and a phone number. */
export interface OfficeCard {
  accent: AccentToken;
  kind: string;
  city: string;
  addressLines: string[];
  phoneLabel: string;
  phoneHref: string;
}

/**
 * The contact page's opening band.
 *
 * It is not the generic hero: the heading is the page's `h1` inside the lead layout, with
 * the reasons-to-write list and office summary beside the form rather than above it.
 */
export interface ContactBannerBlock extends BaseBlock {
  type: 'contactBanner';
  crumbLabel: string;
  heading: string;
  lede: string;
  reasons: LeadReason[];
  offices: OfficeBlock[];
  formTitle: string;
  formSubtitle: string;
}

/**
 * The blog listing's opening band: breadcrumb, eyebrow, heading and the featured-guide
 * label. The featured article itself is the newest published post, not a stored copy.
 */
export interface BlogHeroBlock extends BaseBlock {
  type: 'blogHero';
  crumbLabel: string;
  kicker: string;
  listHeading: string;
  sidebarTitle: string;
  sidebarSubtitle: string;
}

/**
 * Fixed wording around every article: the contents heading, share and author labels, the
 * previous/next captions, the sidebar form's heading and the related-reading band.
 */
export interface ArticleTemplateBlock extends BaseBlock {
  type: 'articleTemplate';
  crumbLabel: string;
  tocLabel: string;
  shareLabel: string;
  authorLabel: string;
  prevLabel: string;
  nextLabel: string;
  sidebarTitle: string;
  sidebarSubtitle: string;
  relatedTitle: string;
  relatedLede: string;
  /**
   * The example article the source template shipped, kept verbatim as the starting body
   * for a new article. It is placeholders throughout — nothing here is presented as real
   * published copy.
   */
  defaultBody: string;
}

/** An icon card: the shape shared by the quick facts, values, why and AI grids. */
export interface IconCard {
  accent: AccentToken;
  icon: string;
  title: string;
  description: string;
}

/** A numbered principle in the about page's "how an engagement runs" list. */
export interface PrincipleItem {
  accent: AccentToken;
  number: string;
  title: string;
  description: string;
}

/**
 * A page heading split around its highlighted phrase.
 *
 * Both heroes wrap part of the headline in `<span class="g">` for the gradient treatment,
 * so the split has to survive as data rather than as markup an editor could break.
 */
export interface SplitHeading {
  lead: string;
  highlight: string;
  trail: string;
}

export interface AboutHeroBlock extends BaseBlock {
  type: 'aboutHero';
  crumbLabel: string;
  splitHeading: SplitHeading;
  lede: string;
  ctas: CtaLink[];
  quickCards: IconCard[];
}

export interface HomeHeroBlock extends BaseBlock {
  type: 'homeHero';
  pillText: string;
  pillStrong: string;
  splitHeading: SplitHeading;
  sub: string;
  ctas: CtaLink[];
  note: string;
}

/** The counters panel. The home page also carries the client marquee inside it. */
export interface StatsPanelBlock extends BaseBlock {
  type: 'statsPanel';
  note: string;
  stats: StatItem[];
  trustedLabel: string;
  logoSlots: string[];
}

export interface StoryBandBlock extends BaseBlock {
  type: 'storyBand';
  lede: string;
  capabilitiesTitle: string;
  capabilities: string[];
  mediaLabel: string;
  mediaHint: string;
  image: MediaRef;
}

export interface ValueGridBlock extends BaseBlock {
  type: 'valueGrid';
  lede: string;
  values: IconCard[];
}

export interface PrincipleListBlock extends BaseBlock {
  type: 'principleList';
  lede: string;
  principles: PrincipleItem[];
}

export interface BrandStripBlock extends BaseBlock {
  type: 'brandStrip';
  label: string;
  logoSlots: string[];
}

export interface AwardsBandBlock extends BaseBlock {
  type: 'awardsBand';
  lede: string;
  awardLead: AwardLead;
  awards: Award[];
}

export interface WhyGridBlock extends BaseBlock {
  type: 'whyGrid';
  lede: string;
  items: IconCard[];
}

export interface ServiceTabsBlock extends BaseBlock {
  type: 'serviceTabs';
  lede: string;
  items: ServiceItem[];
}

export interface CaseCarouselBlock extends BaseBlock {
  type: 'caseCarousel';
  lede: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface TechTabsBlock extends BaseBlock {
  type: 'techTabs';
  lede: string;
  centred: boolean;
  groups: TechStackGroup[];
}

export interface AiGridBlock extends BaseBlock {
  type: 'aiGrid';
  lede: string;
  items: TechnologyItem[];
}

export interface FaqShellBlock extends BaseBlock {
  type: 'faqShell';
  lede: string;
  askTitle: string;
  askBody: string;
  askCtaLabel: string;
  faqs: FaqItem[];
}

export interface LatestInsightsBlock extends BaseBlock {
  type: 'latestInsights';
  lede: string;
  buttonLabel: string;
  limit: number;
}

/**
 * The heading block of a section index — `/services/`, `/solutions/`, `/technologies/`.
 *
 * The cards below it are the live list of pages, so only the wording lives here. The
 * technologies index also carries the stack it lists, because those groups are content
 * rather than pages.
 */
export interface PageIndexBlock extends BaseBlock {
  type: 'pageIndex';
  crumbLabel: string;
  lede: string;
  groups: TechStackGroup[];
}

/** The case-study page's opening band: heading, standfirst and three headline figures. */
export interface PortfolioHeroBlock extends BaseBlock {
  type: 'portfolioHero';
  crumbLabel: string;
  lede: string;
  stats: StatItem[];
}

/**
 * The full-width list of case studies.
 *
 * Unlike the carousel on a service page this shows every published study at full width,
 * with an `h2` per study rather than an `h3`, and closes with a button to the archive.
 */
export interface CaseStudyListBlock extends BaseBlock {
  type: 'caseStudyList';
  ctaLabel: string;
  ctaHref: string;
}

export interface StepGridBlock extends BaseBlock {
  type: 'stepGrid';
  lede: string;
  stepCards: StepCard[];
}

export interface RouteGridBlock extends BaseBlock {
  type: 'routeGrid';
  lede: string;
  routes: ContactRoute[];
}

export interface OfficeCardsBlock extends BaseBlock {
  type: 'officeCards';
  lede: string;
  cards: OfficeCard[];
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
  | LegalDocumentBlock
  | ContactBannerBlock
  | PortfolioHeroBlock
  | BlogHeroBlock
  | PageIndexBlock
  | ArticleTemplateBlock
  | AboutHeroBlock
  | HomeHeroBlock
  | StatsPanelBlock
  | StoryBandBlock
  | ValueGridBlock
  | PrincipleListBlock
  | BrandStripBlock
  | AwardsBandBlock
  | WhyGridBlock
  | ServiceTabsBlock
  | CaseCarouselBlock
  | TechTabsBlock
  | AiGridBlock
  | FaqShellBlock
  | LatestInsightsBlock
  | CaseStudyListBlock
  | StepGridBlock
  | RouteGridBlock
  | OfficeCardsBlock
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
  /**
   * Lead email routing an administrator owns.
   *
   * Recipients, sender name and reply-to only. Provider credentials are server configuration
   * and never appear in the CMS.
   */
  emailDelivery: {
    notifyTo: string;
    notifyCc: string[];
    notifyBcc: string[];
    senderName: string;
    replyTo: string;
    sendClientConfirmation: boolean;
    sendAdminNotification: boolean;
  };
  updatedAt?: string;
}
