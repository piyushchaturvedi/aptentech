/**
 * Database seed.
 *
 * Reads the 25 approved HTML files and loads their real content into MongoDB, so the CMS
 * starts out holding the site as designed rather than empty or filled with invented copy.
 * Placeholders (`[VALUE]`, `[CLIENT NAME]`, `[EMAIL ADDRESS]`, …) are carried across
 * verbatim — they are the content the source actually has, and an admin replaces them
 * later through the CMS.
 *
 * Idempotent: every write is an upsert keyed on slug, so re-running updates in place
 * rather than duplicating.
 */
import fs from 'node:fs';
import { Types, trusted } from 'mongoose';
import path from 'node:path';
import { connectDb, disconnectDb } from '../config/db';
import { seedEmailTemplates } from './emailTemplates';
import { seedMenuPages } from './menuPages';
import { attachDemoImages } from './attachImages';
import { seedDemoContent } from './demoContent';
import {
  BlogCategoryModel,
  BlogPostModel,
  CaseStudyModel,
  FaqModel,
  ServicePageModel,
  SitePageModel,
  SiteSettingsModel,
  TestimonialModel,
  RedirectModel,
  syncIndexes,
} from '../models';
import {
  IconCollector,
  decodeEntities,
  inlineScript,
  readBadges,
  readCases,
  readFaqs,
  readFeatures,
  readHeroSplit,
  readImages,
  readMeta,
  readPosts,
  readServices,
  readSolutions,
  readSteps,
  readTechStack,
  readTechnologies,
  readWhy,
  readSource,
  sourceDir,
  stripTags,
} from './extract';
import {
  readAwards,
  readBrandStrip,
  readCostTable,
  readCtaStrip,
  readIntro,
  readLeadAside,
  readMarketStats,
  readProtect,
  readSectionLedes,
  readCostFactorsCta,
  sectionByIdOrClass,
  readShotConsole,
  readServicesCta,
  readSolutionsCta,
  readWhyAndFaqExtras,
} from './extractSections';
import { readArticleTemplate, readBlogHero, readLeadBand, readPortfolioHero, readPortfolioList } from './extractBands';
import { readContactBanner, readOfficeCards, readRouteGrid, readStepGrid } from './extractContact';
import { readInsightCards, readPageTestimonials } from './extractPageContent';
import {
  readAboutHero,
  readBandHead,
  readBrandStripBand,
  readCaseBand,
  readFaqShell,
  readHomeHero,
  readLatestInsights,
  readPrincipleList,
  readStatsPanel,
  readStoryBand,
  readStripBand,
  readValueGrid,
  readWhyGrid,
} from './extractPages';
import { PAGE_SOURCES, SERVICE_SOURCES, ALL_SOURCE_FILES } from './manifest';
import { accentFromHex, EMPTY_MEDIA, type AccentToken, type MediaRef } from '@aptentech/shared';
import { logger } from '../utils/logger';

const icons = new IconCollector();

/** Records the original `/images/...` path so the slot keeps its size and can be filled later. */
function mediaFrom(src: string | undefined, alt: string, width: number | null, height: number | null): MediaRef {
  if (!src) return { ...EMPTY_MEDIA };
  return { mediaId: null, legacyPath: src, alt, width, height };
}

/**
 * Reads a section heading by its DOM id.
 *
 * The source gives every section heading a stable id (`svc-h2`, `feat-h2`, `proc-h2`, …)
 * and uses the same ids on all 17 service and solution pages. Reading those is exact,
 * whereas keyword matching silently returned nothing when a page phrased a heading
 * differently — "AI capabilities we build" rather than "features".
 */
function headingById(html: string, id: string): string {
  const m = html.match(new RegExp(`<h[1-6][^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</h[1-6]>`));
  return m ? stripTags(m[1]!) : '';
}

/** Reads the text of the first element with a given tag and class. */
function textOfClass(html: string, tag: string, className: string): string {
  const re = new RegExp(`<${tag}[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`);
  return stripTags(html.match(re)?.[1] ?? '');
}

/** Reads the `.lede` paragraph that follows a heading, which is the section's standfirst. */
function ledeAfterHeading(html: string, headingId: string): string {
  const heading = html.match(new RegExp(`<h[1-6][^>]*\\bid="${headingId}"[^>]*>[\\s\\S]*?</h[1-6]>`));
  if (!heading?.index) return '';

  const after = html.slice(heading.index + heading[0].length, heading.index + heading[0].length + 1200);
  return stripTags(after.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
}

/** Finds a heading from the page's H2 list by keyword. Fallback for the bespoke pages. */
function findHeading(h2s: string[], ...keywords: string[]): string {
  const lower = h2s.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw.toLowerCase()));
    if (idx >= 0) return h2s[idx]!;
  }
  return '';
}

interface ExtractedTestimonial {
  accent: AccentToken;
  content: string;
  name: string;
  designation: string;
  company: string;
  industry: string;
  duration: string;
}

function extractTestimonials(html: string): ExtractedTestimonial[] {
  const out: ExtractedTestimonial[] = [];
  for (const m of html.matchAll(/<figure class="tstc[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/figure>/g)) {
    const accent = accentFromHex(m[1]?.trim());
    const body = m[2] ?? '';
    const quote = body.match(/<blockquote>([\s\S]*?)<\/blockquote>/)?.[1] ?? '';
    const nameMatch = body.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? '';
    const roleLine = stripTags(body.match(/<em>([\s\S]*?)<\/em>/)?.[1] ?? '');
    const meta = [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((s) => stripTags(s[1] ?? ''));

    const [designation = '', company = ''] = roleLine.split(',').map((s) => s.trim());

    out.push({
      accent,
      content: stripTags(quote).replace(/^"|"$/g, ''),
      name: stripTags(nameMatch),
      designation,
      company,
      industry: meta.find((x) => x.startsWith('Industry:'))?.replace('Industry:', '').trim() ?? '',
      duration: meta.find((x) => x.startsWith('Duration:'))?.replace('Duration:', '').trim() ?? '',
    });
  }
  return out;
}

/**
 * Maps a section's DOM id in the source to the schema field that renders it.
 *
 * Used to translate the source's section order, and any CSS that hides a section, into
 * CMS state rather than carrying presentation overrides across.
 */
const SECTION_BY_DOM_ID: Readonly<Record<string, string>> = {
  overview: 'positioning',
  services: 'services',
  awards: 'recognition',
  solutions: 'solutions',
  portfolio: 'caseStudies',
  testimonials: 'testimonials',
  features: 'features',
  ai: 'technologies',
  compliance: 'compliance',
  process: 'process',
  cost: 'pricing',
  tech: 'techStack',
  why: 'why',
  faq: 'faqs',
  blog: 'latestInsights',
  contact: 'leadForm',
};

/**
 * The sections this page draws on the tinted background.
 *
 * The design alternates `.canvas` down the page, so the same section is banded on one page
 * and not on another depending on what sits above it. Reading the ids the source actually
 * marked keeps the rhythm identical instead of guessing it per section.
 */
function extractCanvasSectionIds(html: string): string[] {
  const ids: string[] = [];
  for (const m of html.matchAll(/<section class="[^"]*\bcanvas\b[^"]*"[^>]*\bid="([a-z][a-z0-9-]*)"/g)) {
    if (!ids.includes(m[1]!)) ids.push(m[1]!);
  }
  return ids;
}

/** Sections whose heading block is centred rather than left-aligned. */
function extractCentredHeadIds(html: string): string[] {
  const ids: string[] = [];
  for (const m of html.matchAll(
    /<section[^>]*\bid="([a-z][a-z0-9-]*)"[\s\S]{0,600}?<div class="sect-head center"/g,
  )) {
    if (!ids.includes(m[1]!)) ids.push(m[1]!);
  }
  return ids;
}

/** The section order actually used by the page, so the CMS starts out matching the design. */
function extractSectionOrder(html: string): string[] {
  const order: string[] = [];
  for (const m of html.matchAll(/<section[^>]*\bid="([a-z][a-z0-9-]*)"/g)) {
    const key = SECTION_BY_DOM_ID[m[1]!];
    if (key && !order.includes(key)) order.push(key);
  }
  return order;
}

/**
 * Sections the page hides with a CSS override.
 *
 * The GEO page ships `#cost{display:none!important}` to drop its pricing block. Carrying
 * that rule across would hide pricing on every page sharing the template, so it is
 * translated into `hiddenSections` instead — same visual result, the markup is simply not
 * rendered, and an editor can now toggle it.
 */
function extractHiddenSections(html: string): string[] {
  const hidden: string[] = [];
  for (const m of html.matchAll(/#([a-z][a-z0-9-]*)\s*\{\s*display:\s*none\s*!important\s*\}/g)) {
    const key = SECTION_BY_DOM_ID[m[1]!];
    if (key && !hidden.includes(key)) hidden.push(key);
  }
  return hidden;
}

function extractStats(html: string): Array<{ value: string; suffix: string; label: string }> {
  const out: Array<{ value: string; suffix: string; label: string }> = [];
  for (const m of html.matchAll(
    /data-count="([^"]*)"\s+data-suffix="([^"]*)"[^>]*>[\s\S]*?<div class="lab">([\s\S]*?)<\/div>/g,
  )) {
    out.push({ value: m[1] ?? '', suffix: m[2] ?? '', label: stripTags(m[3] ?? '') });
  }
  return out;
}

interface NavLinkSeed {
  label: string;
  href: string;
}

/**
 * Returns the contents of `ul.nav`, matching `<ul>`/`</ul>` by depth.
 *
 * A non-greedy regex stops at the first `</ul>`, which belongs to a link list nested
 * inside the first mega panel — so the desktop menu has to be found by counting.
 */
function navListInner(headerHtml: string): string {
  const open = headerHtml.search(/<ul class="nav"[^>]*>/);
  if (open < 0) return '';

  const startTag = headerHtml.slice(open).match(/<ul class="nav"[^>]*>/)![0];
  const contentStart = open + startTag.length;

  let depth = 1;
  for (const m of headerHtml.slice(contentStart).matchAll(/<(\/?)ul[\s>]/g)) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return headerHtml.slice(contentStart, contentStart + m.index!);
  }
  return headerHtml.slice(contentStart);
}

/**
 * Splits a `<ul>` body into its direct `<li>` children.
 *
 * Each mega panel contains its own `<li>` elements, so a plain split on `<li>` would treat
 * every menu entry as a top-level item — which is what produced a flat, column-less menu
 * on the first attempt.
 */
function topLevelListItems(ulInner: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = -1;

  for (const m of ulInner.matchAll(/<(\/?)li[\s>]/g)) {
    const closing = m[1] === '/';
    if (!closing) {
      if (depth === 0) start = m.index! + m[0].length;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        items.push(ulInner.slice(start, m.index!));
        start = -1;
      }
    }
  }
  return items;
}

/**
 * Returns the direct `<div>` children of a mega panel's `.mcols` container.
 *
 * Depth-aware, because each column contains its own nested `<div>`/`<ul>` markup; a plain
 * split would cut columns in half.
 */
function megaColumns(itemHtml: string): string[] {
  const mcolsTag = itemHtml.match(/<div class="mcols[^"]*"[^>]*>/);
  if (!mcolsTag) return [];

  const start = itemHtml.indexOf(mcolsTag[0]) + mcolsTag[0].length;

  // Find the end of the .mcols container by counting div depth.
  let depth = 1;
  let end = itemHtml.length;
  for (const m of itemHtml.slice(start).matchAll(/<(\/?)div[\s>]/g)) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) {
      end = start + m.index!;
      break;
    }
  }

  const inner = itemHtml.slice(start, end);
  const columns: string[] = [];
  let childDepth = 0;
  let childStart = -1;

  for (const m of inner.matchAll(/<(\/?)div([\s>])/g)) {
    const closing = m[1] === '/';
    if (!closing) {
      if (childDepth === 0) childStart = m.index!;
      childDepth += 1;
    } else {
      childDepth -= 1;
      if (childDepth === 0 && childStart >= 0) {
        const block = inner.slice(childStart, m.index!);
        // The promo tile lives alongside the columns but is not one.
        if (!/class="mpromo"/.test(block)) columns.push(block);
        childStart = -1;
      }
    }
  }
  return columns;
}

/**
 * Extracts the header mega-menu and footer columns so navigation becomes CMS-managed.
 *
 * The markup nests as `ul.nav > li > (button | a)` with an optional `div.mega` panel
 * holding `p.mega-label` headings above each link list; the footer uses
 * `nav.f-col > p.f-label + ul`.
 *
 * Note on link targets: the audit found roughly 1,850 navigation links collapsing onto
 * five generic stub paths, and several menu entries point at routes with no page behind
 * them. Those hrefs are seeded exactly as the source has them rather than being guessed
 * at — repointing them is a content decision an admin now makes in the CMS, not something
 * to invent here.
 */
function extractNavigation(html: string, icons: IconCollector) {
  const headerHtml = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const footerHtml = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));

  const groups: Array<{
    label: string;
    href: string;
    alignRight?: boolean;
    columns: Array<{ heading: string; accent: AccentToken; links: NavLinkSeed[] }>;
    promoTitle?: string;
    promoBody?: string;
    promoCta?: { label: string; href: string; style: 'primary' } | null;
  }> = [];

  const navInner = navListInner(headerHtml);

  for (const item of topLevelListItems(navInner)) {
    const buttonLabel = stripTags(item.match(/<button[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? '');

    if (buttonLabel) {
      const columns: Array<{ heading: string; accent: AccentToken; links: NavLinkSeed[] }> = [];

      // Columns are the direct <div> children of .mcols. Some carry a <p class="mega-label">
      // heading with a colour swatch; the Industries and Technologies menus split their
      // links across two unlabelled columns instead, and both shapes must survive.
      for (const colHtml of megaColumns(item)) {
        const labelHtml = colHtml.match(/<p class="mega-label"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
        const heading = stripTags(labelHtml);
        const accent = accentFromHex(labelHtml.match(/background:\s*(#[0-9A-Fa-f]{6})/)?.[1]);

        const links = [...colHtml.matchAll(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
          .map((a) => ({ href: a[1] ?? '#', label: stripTags(a[2] ?? '') }))
          .filter((l) => l.label);

        if (links.length) columns.push({ heading, accent, links });
      }

      const promo = item.match(/<div class="mpromo"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
      const promoTitle = stripTags(promo?.[1]?.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? '');
      const promoBody = stripTags(promo?.[1]?.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? '');
      const promoCtaMatch = item.match(/<div class="mpromo"[\s\S]*?<a href="([^"]*)"[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/);

      groups.push({
        label: buttonLabel,
        href: '#',
        // The last panel opens right-aligned so it cannot run off the viewport edge.
        alignRight: /<div class="mega right"/.test(item),
        columns,
        promoTitle,
        promoBody,
        promoCta: promoCtaMatch
          ? { label: stripTags(promoCtaMatch[2] ?? ''), href: promoCtaMatch[1] ?? '#', style: 'primary' as const }
          : null,
      });
      continue;
    }

    // A plain top-level link, such as About or Contact.
    const direct = item.match(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (direct) {
      const label = stripTags(direct[2] ?? '');
      if (label) groups.push({ label, href: direct[1] ?? '#', columns: [] });
    }
  }

  // The mobile menu is a separate list in the source — two expandable groups and five
  // direct links — so it is read on its own rather than derived from the desktop menu.
  const mobileNavigation: Array<{ label: string; href: string; links: NavLinkSeed[] }> = [];
  let mobileNavCta: { label: string; href: string; style: 'primary' } | null = null;

  const mnav = headerHtml.match(/<nav class="mnav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
  for (const item of topLevelListItems(mnav.replace(/^[\s\S]*?<ul>/, '').replace(/<\/ul>[\s\S]*$/, ''))) {
    const groupLabel = stripTags(item.match(/<button class="top"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? '');
    if (groupLabel) {
      const sub = item.match(/<div class="sub">([\s\S]*?)<\/div>/)?.[1] ?? '';
      mobileNavigation.push({
        label: groupLabel,
        href: '#',
        links: [...sub.matchAll(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
          .map((a) => ({ href: a[1] ?? '#', label: stripTags(a[2] ?? '') }))
          .filter((l) => l.label),
      });
      continue;
    }

    const btn = item.match(/<a\s+href="([^"]*)"[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (btn) {
      mobileNavCta = { label: stripTags(btn[2] ?? ''), href: btn[1] ?? '#', style: 'primary' as const };
      continue;
    }

    const direct = item.match(/<a class="top"\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (direct) {
      const label = stripTags(direct[2] ?? '');
      if (label) mobileNavigation.push({ label, href: direct[1] ?? '#', links: [] });
    }
  }

  // Each footer nav is `<p class="f-label">` + `<ul>`; the Industries column carries a
  // second labelled list ("Resources") inside the same nav, which is kept as a secondary
  // group rather than being dropped or split into a column the design does not have.
  const footerColumns: Array<{
    heading: string;
    links: NavLinkSeed[];
    secondaryHeading?: string;
    secondaryLinks?: NavLinkSeed[];
  }> = [];

  for (const col of footerHtml.matchAll(/<nav class="f-col"[^>]*>([\s\S]*?)<\/nav>/g)) {
    const inner = col[1] ?? '';
    const groups2 = [...inner.matchAll(/<p class="f-label"[^>]*>([\s\S]*?)<\/p>\s*<ul>([\s\S]*?)<\/ul>/g)].map(
      (g) => ({
        heading: stripTags(g[1] ?? ''),
        links: [...(g[2] ?? '').matchAll(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
          .map((a) => ({ href: a[1] ?? '#', label: stripTags(a[2] ?? '') }))
          .filter((l) => l.label),
      }),
    );

    const first = groups2[0];
    if (!first || !first.links.length) continue;

    const second = groups2[1];
    footerColumns.push({
      heading: first.heading,
      links: first.links,
      ...(second ? { secondaryHeading: second.heading, secondaryLinks: second.links } : {}),
    });
  }

  // Social profiles. The source ships icons with `href="#"`; the href is seeded empty so
  // nothing renders as a link to nowhere, and an admin supplies the real profile URLs.
  const socialsBlock = footerHtml.match(/<div class="socials">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const socials = [...socialsBlock.matchAll(/<a[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    label: m[1] ?? '',
    href: '',
    icon: icons.add(m[2]?.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? ''),
  }));

  const footerCtaMatch = footerHtml.match(
    /<div class="f-mid">[\s\S]*?<a href="([^"]*)"[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/,
  );
  const footerCta = footerCtaMatch
    ? { label: stripTags(footerCtaMatch[2] ?? ''), href: footerCtaMatch[1] ?? '#', style: 'primary' as const }
    : null;

  /*
    Where each menu entry goes.

    Every label below now has a page of its own, generated by `seedMenuPages` from copy the
    source already published. Before that, five "AI Solutions" links opened the same screen
    and every industry opened the unfiltered case-study index, which is what made the menu
    look broken.

    The four labels that already had a source page keep pointing at it: creating
    `/services/custom-software/` beside `/services/software-development/` would split one
    page's search ranking across two URLs and break a canonical the source declared.
  */
  const MENU_TARGETS: Readonly<Record<string, string>> = {
    // AI and automation.
    'AI Development': '/services/ai-development/',
    'Generative AI': '/services/generative-ai/',
    'AI Agents': '/services/ai-agents/',
    'AI Automation': '/services/ai-automation/',
    'RAG Solutions': '/services/rag-solutions/',

    // Engineering. "Custom Software" is the menu's name for the software development page.
    'Custom Software': '/services/software-development/',
    'Web Applications': '/services/web-development/',
    'SaaS Development': '/services/saas-development/',
    'Enterprise Software': '/services/enterprise-software/',
    'Product Engineering': '/services/product-engineering/',

    // Mobile, cloud and design.
    'iOS & Android': '/services/ios-android/',
    'Flutter & React Native': '/services/flutter-react-native/',
    'Cloud & DevOps': '/services/cloud-devops/',
    'Cloud Migration': '/services/cloud-migration/',
    'UI/UX Design': '/services/ui-ux-design/',

    /*
      The footer names the same things in shorter words than the header does. They are listed
      separately rather than normalised, because matching on a loosened label would pair
      "Web platforms" with the "Web Applications" entry by luck rather than by decision.
    */
    'Custom software': '/services/software-development/',
    'Mobile apps': '/services/mobile-app-development/',
    'Web platforms': '/services/web-development/',
    'Agentic AI': '/services/ai-agents/',
    'RAG solutions': '/services/rag-solutions/',
    'AI copilots': '/services/generative-ai/',
    'AI automation': '/services/ai-automation/',
    'UI/UX design': '/services/ui-ux-design/',

    // Resources. "Insights" and "Guides" are the footer's other names for the blog; the
    // source linked all three at /insights/, which only ever redirected.
    Blog: '/blog/',
    Insights: '/blog/',
    Guides: '/blog/',

    // Solutions, by outcome and by platform.
    'Workflow automation': '/solutions/workflow-automation/',
    'Customer support AI': '/solutions/customer-support-ai/',
    'Legacy modernization': '/solutions/legacy-modernization/',
    'MVP for startups': '/solutions/mvp-for-startups/',
    'SaaS platforms': '/solutions/saas-platforms/',
    'Enterprise portals': '/solutions/enterprise-portals/',
    'Data & analytics': '/solutions/data-analytics/',

    // Industries.
    Healthcare: '/industries/healthcare/',
    'FinTech & Banking': '/industries/fintech-banking/',
    FinTech: '/industries/fintech-banking/',
    'E-commerce & Retail': '/industries/e-commerce-retail/',
    Logistics: '/industries/logistics/',
    Education: '/industries/education/',
    'Real Estate': '/industries/real-estate/',
    'Travel & Hospitality': '/industries/travel-hospitality/',
    Media: '/industries/media/',

    // Technologies. The footer names specific stacks; each maps to the group page that holds it.
    'Frontend & Backend': '/technologies/frontend-backend/',
    Mobile: '/technologies/mobile/',
    'AI / ML': '/technologies/ai-ml/',
    Cloud: '/technologies/cloud/',
    Databases: '/technologies/databases/',
    DevOps: '/technologies/devops/',
    CMS: '/technologies/cms/',
    'React & Next.js': '/technologies/frontend-backend/',
    'Node.js & Python': '/technologies/frontend-backend/',
    'AWS · Azure · GCP': '/technologies/cloud/',
    'Docker & Kubernetes': '/technologies/devops/',
  };

  /**
   * Entries whose destination depends on the menu they sit in.
   *
   * "E-commerce" appears three times — as a solution, as an industry and as a technology —
   * and each one belongs somewhere different. Matching on the label alone would send all
   * three to whichever happened to be defined last.
   */
  const SCOPED_TARGETS: Readonly<Record<string, string>> = {
    'Solutions|E-commerce': '/solutions/e-commerce/',
    'Technologies|E-commerce': '/technologies/e-commerce/',
    'Industries|E-commerce': '/industries/e-commerce-retail/',
    'Industries|E-commerce & Retail': '/industries/e-commerce-retail/',
    // Also a technology group, but under Services it names the mobile service, not the stack.
    'Services|Flutter & React Native': '/services/flutter-react-native/',
    'Technologies|Mobile': '/technologies/mobile/',
    // Under the footer's Technologies heading this names the stack, not the mobile service.
    'Technologies|Flutter & React Native': '/technologies/mobile/',
  };

  /*
    Technology entries open the matching tab on the technologies page.

    Nine categories are listed in the menus and all nine used to land on the same page
    showing the same first tab, which is why they read as broken. The fragment is the
    category id `TechStackTabs` gives each tab, so the two have to agree — if a category is
    renamed in the CMS, its menu link opens the first tab again until this is updated.
  */
  /**
   * Legacy anchor targets, now empty.
   *
   * Each of these labels has a page of its own, so the anchor form is no longer used. The
   * table stays as the seam it always was: a future entry that has no page can be pointed at
   * an anchor here without touching the resolver.
   */
  const TECH_TARGETS: Readonly<Record<string, string>> = {};

  /*
    Industry entries filter the case-study index.

    Every one of them pointed at the unfiltered index, so eight different industries all
    showed the same eight studies. The query names a group defined in the web app's industry
    table, which maps it onto the specific industries the studies actually record.

    Only industries the index's own studies cover get a filter. The index carries eight
    studies — the ones the page was designed around — and they span fitness, fuel and food
    delivery, travel, and music and video streaming. FinTech, E-commerce, Education and Real
    Estate are named in the menus but have no study here, so they link to the unfiltered
    index rather than to a query that would quietly show everything and look broken twice
    over. Add a study in one of those industries and its entry can move to a filter.
  */
  const INDUSTRY_TARGETS: Readonly<Record<string, string>> = {};

  /** Which index a column belongs to, used for entries with no page of their own. */
  const columnFallback = (groupLabel: string): string => {
    if (groupLabel === 'Technologies') return '/technologies/';
    if (groupLabel === 'Solutions') return '/solutions/';
    if (groupLabel === 'Industries') return '/industries/';
    if (groupLabel === 'Resources') return '/blog/';
    if (groupLabel === 'Company') return '/about/';
    return '/services/';
  };

  /**
   * The destination for one menu entry, most specific rule first.
   *
   * `scope` is the group or footer heading the entry sits under, which is what separates the
   * three different "E-commerce" entries the menus contain.
   */
  const resolve = (scope: string, label: string, current: string): string =>
    SCOPED_TARGETS[`${scope}|${label}`] ??
    TECH_TARGETS[label] ??
    INDUSTRY_TARGETS[label] ??
    MENU_TARGETS[label] ??
    (current === '#' ? current : columnFallback(scope));

  for (const group of groups) {
    for (const column of group.columns) {
      column.links = column.links.map((link) => ({
        ...link,
        href: resolve(group.label, link.label, link.href),
      }));
    }
  }

  /*
    The footer gets the same treatment, which it was missing entirely.

    Its five columns list twenty-five entries, and every column pointed all of its entries at
    one index — five different services at `/services/`, five industries at `/case-studies/`,
    five AI capabilities at a path that only redirected to a fragment on the home page. The
    links resolved, so a crawl reported them healthy; they were still useless to click, which
    is exactly how they were reported.

    Column headings are the plural section names ("SERVICES", "INDUSTRIES"), so they are
    folded to the singular scope the tables are keyed by.
  */
  const footerScope = (heading: string): string => {
    const h = heading.trim().toLowerCase();
    if (h.startsWith('technolog')) return 'Technologies';
    if (h.startsWith('industr')) return 'Industries';
    if (h.startsWith('ai ') || h === 'ai solutions') return 'Solutions';
    if (h.startsWith('resource')) return 'Resources';
    if (h.startsWith('compan')) return 'Company';
    return 'Services';
  };

  for (const column of footerColumns) {
    const scope = footerScope(column.heading);

    // Company and Resources already point at real pages in the source; leaving a resolved
    // href alone keeps `/about/#awards` intact rather than flattening it to `/about/`.
    const remap = (link: NavLinkSeed): NavLinkSeed => {
      const target =
        SCOPED_TARGETS[`${scope}|${link.label}`] ??
        TECH_TARGETS[link.label] ??
        INDUSTRY_TARGETS[link.label] ??
        MENU_TARGETS[link.label];

      if (target) return { ...link, href: target };
      if (link.href && link.href !== '#') return link;
      return { ...link, href: columnFallback(scope) };
    };

    column.links = column.links.map(remap);
    if (column.secondaryLinks) column.secondaryLinks = column.secondaryLinks.map(remap);
  }

  // A menu group that opens a panel has no page of its own; the label is the panel's toggle.
  for (const group of groups) {
    if (group.columns.length && group.href === '#') group.href = columnFallback(group.label);
  }

  // The mobile menu is a separate list with its own labels, and needs the same treatment.
  const MOBILE_TARGETS: Readonly<Record<string, string>> = {
    'AI & Automation': '/services/ai-development/',
    'Mobile App Development': '/services/mobile-app-development/',
    'Web & Digital Platforms': '/services/web-development/',
    'Custom Software & Enterprise': '/services/software-development/',
    'Cloud & DevOps': '/services/cloud-devops/',
    'UI/UX & Product Design': '/services/ui-ux-design/',
    'AI Capabilities': '/services/ai-development/',
    Industries: '/industries/',
  };

  for (const item of mobileNavigation) {
    if (MOBILE_TARGETS[item.label]) item.href = MOBILE_TARGETS[item.label]!;
    item.links = item.links.map((link) => ({
      ...link,
      href: MOBILE_TARGETS[link.label] ?? MENU_TARGETS[link.label] ?? link.href,
    }));
  }

  /*
    Site chrome cannot rely on an in-page anchor. `#contact` resolves on the service,
    solution, home, about and case-study pages and nowhere else, so the same header link
    silently did nothing on the blog and the legal pages. Everywhere the chrome pointed at
    it, it now points at the contact route.
  */
  const toContactRoute = <T extends { href: string }>(link: T): T =>
    link.href === '#contact' ? { ...link, href: '/contact/' } : link;

  for (const group of groups) {
    Object.assign(group, toContactRoute(group as { href: string }));
    if (group.promoCta) group.promoCta = toContactRoute(group.promoCta);
    for (const column of group.columns) column.links = column.links.map(toContactRoute);
  }
  for (const item of mobileNavigation) {
    Object.assign(item, toContactRoute(item));
    item.links = item.links.map(toContactRoute);
  }
  for (const column of footerColumns) {
    column.links = column.links.map(toContactRoute);
    if (column.secondaryLinks) column.secondaryLinks = column.secondaryLinks.map(toContactRoute);
  }

  return { groups, mobileNavigation, mobileNavCta, footerColumns, socials, footerCta };
}

/* ------------------------------------------------------------------ seeders */

/**
 * Seeds the three testimonials a service or solution page carries.
 *
 * They are page-specific: the taxi page's quotes are about matching and driver onboarding,
 * the fitness page's about coaching. `attachedTo` records which page each belongs to so an
 * editor can see it, and `visible: false` keeps them out of any site-wide listing while
 * still rendering on their own page.
 */
async function seedPageTestimonials(pageSlug: string, html: string): Promise<Types.ObjectId[]> {
  const items = readPageTestimonials(html);
  const ids: Types.ObjectId[] = [];

  for (const [index, t] of items.entries()) {
    const doc = await TestimonialModel.findOneAndUpdate(
      { sourceKey: `${pageSlug}#${index}` },
      {
        $set: {
          sourceKey: `${pageSlug}#${index}`,
          name: t.name,
          designation: t.designation,
          company: t.company,
          content: t.content,
          industry: t.industry,
          duration: t.duration,
          rating: t.rating,
          photo: { ...EMPTY_MEDIA },
          attachedTo: [pageSlug],
          order: index,
          visible: true,
        },
      },
      { upsert: true, new: true },
    );
    if (doc?._id) ids.push(doc._id as Types.ObjectId);
  }

  return ids;
}

/**
 * Seeds the three articles a page links from its "latest insights" band.
 *
 * The source wrote these cards into each page with real `/blog/<slug>/` targets, so they
 * are articles the site intends to have rather than decoration. Seeding them keeps the copy
 * and makes those links resolve; each has the title and standfirst the source wrote and an
 * empty body for an editor to complete, exactly like the ones on the blog listing.
 */
async function seedPageInsights(html: string): Promise<Types.ObjectId[]> {
  const cards = readInsightCards(html);
  const ids: Types.ObjectId[] = [];

  for (const card of cards) {
    if (!card.slug) continue;

    const doc = await BlogPostModel.findOneAndUpdate(
      { slug: card.slug },
      {
        $setOnInsert: {
          slug: card.slug,
          accent: card.accent,
          title: card.title,
          excerpt: card.excerpt,
          body: `<p>${card.excerpt}</p>`,
          categoryName: card.categoryName,
          tags: [card.categoryName].filter(Boolean),
          authorName: '[AUTHOR NAME]',
          authorRole: ARTICLE_AUTHOR_ROLE,
          authorBio: ARTICLE_AUTHOR_BIO,
          coverImage: mediaFrom(`/images/blog/${card.slug}.jpg`, card.title, 760, 520),
          readingMinutes: readingMinutes(card.excerpt),
          status: 'PUBLISHED',
          publishedAt: null,
          faqs: [],
          seo: {
            title: `${card.title} | Aptentech`,
            description: card.excerpt.slice(0, 300),
            canonical: `https://aptentech.com/blog/${card.slug}/`,
          },
        },
      },
      { upsert: true, new: true },
    );
    if (doc?._id) ids.push(doc._id as Types.ObjectId);
  }

  return ids;
}

/**
 * Seeds the four case studies a service or solution page carries in its own `CASES` array.
 *
 * Every one of the 17 pages ships a different set — the taxi page's airport-transfer and
 * corporate-transport projects are not the ones on the SEO page — so attaching one shared
 * carousel to all of them would have dropped 68 genuine entries. They are marked
 * `showInIndex: false` because the source only listed the portfolio page's eight on
 * /case-studies/; an admin can promote any of them from the CMS.
 */
async function seedPageCaseStudies(pageSlug: string, js: string): Promise<Types.ObjectId[]> {
  const cases = readCases(js);
  const shotConsole = readShotConsole(js);
  const ids: Types.ObjectId[] = [];

  for (const [index, c] of cases.entries()) {
    const slug = `${pageSlug}-case-${index + 1}`;
    const doc = await CaseStudyModel.findOneAndUpdate(
      { slug },
      {
        $set: {
          slug,
          accent: c.accent,
          industry: c.industry,
          techSummary: c.techSummary,
          tag: c.tag,
          title: c.title,
          problem: c.problem,
          solution: c.solution,
          result: c.result,
          metrics: c.metrics,
          shot: c.shot,
          shotConsole,
          // The source's "Read the full case study" link points at the index on these cards.
          detailHref: '/case-studies/',
          technologies: c.techSummary.split('·').map((t) => t.trim()).filter(Boolean),
          category: c.industry,
          projectUrl: '',
          featured: false,
          showInIndex: false,
          order: index,
          status: 'PUBLISHED',
          images: [],
          seo: { title: c.title, description: c.problem.slice(0, 300), canonical: '' },
        },
      },
      { upsert: true, new: true },
    );
    if (doc?._id) ids.push(doc._id as Types.ObjectId);
  }

  return ids;
}

async function seedServicePages(): Promise<number> {
  let count = 0;

  for (const src of SERVICE_SOURCES) {
    const html = readSource(src.file);
    const js = inlineScript(html);
    const meta = readMeta(html);
    const images = readImages(html);
    const h2s = meta.h2s;

    const hero = readHeroSplit(html);
    const brandStrip = readBrandStrip(html);
    const intro = readIntro(html);
    const awards = readAwards(html, icons);
    const leadAside = readLeadAside(html, icons);
    const cta1 = readCtaStrip(html, 'cta1-h2');
    const cta2 = readCtaStrip(html, 'cta2-h2');
    const extras = readWhyAndFaqExtras(html);
    const featureData = readFeatures(js, icons);

    const heroImage = images[0]
      ? mediaFrom(images[0].src, images[0].alt, images[0].width, images[0].height)
      : { ...EMPTY_MEDIA };
    const secondaryImage = images[1]
      ? mediaFrom(images[1].src, images[1].alt, images[1].width, images[1].height)
      : { ...EMPTY_MEDIA };

    const doc = {
      kind: src.kind,
      slug: src.slug,
      name: src.name,
      order: src.order,
      status: 'PUBLISHED' as const,

      // Service and solution pages use the split hero; fall back to the generic reader if a
      // page ever stops using it, rather than silently rendering an empty hero.
      heroEyebrow: '',
      heroTitle: hero?.title || meta.h1,
      heroTitleHighlight: hero?.titleHighlight ?? '',
      heroDescription: hero?.lede || meta.heroLede,
      heroPoints: hero?.points ?? [],
      heroCtaLabel: hero?.ctaLabel ?? '',
      heroCtaNote: hero?.ctaNote ?? '',
      heroImage,
      heroCtas: [],
      heroFormTitle: textOfClass(html, 'h2', 'hf-title'),
      heroFormSubtitle: textOfClass(html, 'p', 'hf-sub'),

      valuePropTitle: headingById(html, 'pro-h2'),
      valuePropBody: readSectionLedes(html).protect ?? '',
      positioningTitle: headingById(html, 'ov-h2'),
      positioningBody: readSectionLedes(html).positioning ?? '',
      positioningImage: secondaryImage,

      marketContextTitle: headingById(html, 'mkt-h2'),
      marketContextBody: readSectionLedes(html).marketContext ?? '',

      sectionLedes: readSectionLedes(html),
      brandStripLabel: brandStrip.label,
      logoSlots: brandStrip.slots,
      protectTitle: headingById(html, 'pro-h2'),
      protect: readProtect(html, icons),
      coreCapabilitiesTitle: intro.capabilitiesTitle,
      coreCapabilities: intro.capabilities,
      introMediaLabel: intro.mediaLabel,
      introMediaHint: intro.mediaHint,
      marketStats: readMarketStats(html),
      statsTitle: headingById(html, 'stats-h2'),
      statsNote: textOfClass(html, 'p', 'ks'),
      stats: extractStats(html),
      recognitionTitle: headingById(html, 'aw-h2'),
      awardLead: awards.lead,
      awards: awards.items,
      caseStudiesTitle: headingById(html, 'pf-h2'),
      testimonialsTitle: headingById(html, 'tst-h2'),
      latestInsightsTitle: headingById(html, 'blog-h2'),
      latestInsightsBody: ledeAfterHeading(html, 'blog-h2'),
      midCta2Title: headingById(html, 'cta2-h2'),

      servicesTitle: headingById(html, 'svc-h2'),
      services: readServices(js, icons),

      solutionsTitle: headingById(html, 'sol-h2'),
      servicesCtaLabel: readServicesCta(html),
      solutionsCtaLabel: readSolutionsCta(html),
      solutions: readSolutions(js, icons),

      featuresTitle: headingById(html, 'feat-h2'),
      featuresLayout: featureData.layout,
      features: featureData.items,

      technologiesTitle: headingById(html, 'ai-h2'),
      technologies: readTechnologies(js, icons),

      complianceTitle: headingById(html, 'comp-h2'),
      compliance: readBadges(js, icons),

      processTitle: headingById(html, 'proc-h2'),
      process: readSteps(js),

      pricingTitle: headingById(html, 'cost-h2'),
      pricingBody: '',
      costTable: readCostTable(html),
      costFactorsCtaLabel: readCostFactorsCta(html),

      techStackTitle: headingById(html, 'tech-h2'),
      techStack: readTechStack(js),

      whyTitle: headingById(html, 'why-h2'),
      why: readWhy(js),

      faqTitle: headingById(html, 'faq-h2'),
      faqs: readFaqs(js),

      midCtaTitle: headingById(html, 'cta1-h2'),
      midCtaBody: cta1.body,
      midCtaButton: cta1.button,
      midCtaPoints: cta1.points,
      midCta2Body: cta2.body,
      midCta2Button: cta2.button,
      midCta2Points: cta2.points,
      midCta2MediaLabel: cta2.media.label,
      midCta2MediaHint: cta2.media.hint,

      closingCtaTitle: headingById(html, 'lead-h2'),
      closingCtaBody: '',
      leadReasons: leadAside.reasons,
      leadOffices: leadAside.offices,
      whyCtaLabel: extras.whyCtaLabel,
      faqAfter: extras.faqAfter,
      faqAfterCtaLabel: extras.faqAfterCtaLabel,

      leadForm: extractLeadForm(html),

      caseStudyIds: await seedPageCaseStudies(src.slug, js),
      testimonialIds: await seedPageTestimonials(src.slug, html),
      latestPostIds: await seedPageInsights(html),
      canvasSectionIds: extractCanvasSectionIds(html),
      centredHeadIds: extractCentredHeadIds(html),
      // Only the dating page carries a hero overlay, and it is the only one in the design.
      heroDecoration: /<div class="hearts"/.test(html) ? ('hearts' as const) : ('none' as const),
      whyCtaStyle: /<div class="cc-cta[^"]*"[^>]*>\s*<a[^>]*class="btn[^"]*btn-lg/.test(
        sectionByIdOrClass(html, 'why'),
      )
        ? ('strip' as const)
        : ('inline' as const),
      sectionOrder: extractSectionOrder(html),
      hiddenSections: extractHiddenSections(html),

      seo: {
        title: meta.title,
        description: meta.description,
        // The GEO page's og:url pointed at the AI-SEO page in the source, which would have
        // told search engines the two are the same page. The canonical is authoritative.
        canonical: meta.canonical,
        ogTitle: meta.ogTitle,
        ogDescription: meta.ogDescription,
        ogImage: { ...EMPTY_MEDIA },
        robotsIndex: true,
        robotsFollow: true,
      },
    };

    await ServicePageModel.findOneAndUpdate({ kind: src.kind, slug: src.slug }, { $set: doc }, { upsert: true, new: true });
    count += 1;
  }

  return count;
}

/**
 * Reads the label from the page's main lead form.
 *
 * Pages carry two forms: a compact `heroForm` at the top and the full `leadForm` lower
 * down, and their buttons say different things. Scoping to the `leadForm` element matters
 * because several pages customise this label — "Get my free SEO audit", "Get my GEO
 * visibility audit" — and taking the first submit button on the page would replace all of
 * them with the hero form's generic "Submit your requirement".
 */
function extractSubmitLabel(html: string): string {
  const FALLBACK = 'Get a Free Consultation';

  const formStart = html.indexOf('id="leadForm"');
  if (formStart >= 0) {
    const formEnd = html.indexOf('</form>', formStart);
    const scope = html.slice(formStart, formEnd > 0 ? formEnd : formStart + 8000);
    const m = scope.match(/<button[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/);
    if (m) {
      // The button contains a trailing arrow SVG; stripTags leaves just the words.
      const label = stripTags(m[1]!);
      if (label) return label;
    }
  }
  return FALLBACK;
}

function extractServiceOptions(html: string): string[] {
  const select = html.match(/<select[^>]*name="service"[^>]*>([\s\S]*?)<\/select>/);
  if (!select) return [];
  return [...select[1]!.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/g)]
    .map((m) => stripTags(m[1]!))
    .filter((v) => v && !/^select a/i.test(v));
}

/**
 * Reads the whole lead form configuration from a page.
 *
 * Labels, options and helper text differ per page — the SEO page asks for a "Monthly SEO
 * budget" with its own ranges, a solution page asks for an "Approximate budget" — so all
 * of it is captured rather than normalised to one wording.
 */
function extractLeadForm(html: string) {
  const formStart = html.indexOf('id="leadForm"');
  const scope = formStart >= 0 ? html.slice(formStart, html.indexOf('</form>', formStart)) : html;

  const label = (forAttr: string, fallback: string): string => {
    const m = scope.match(new RegExp(`<label for="${forAttr}">([\\s\\S]*?)</label>`));
    return m ? stripTags(m[1]!) || fallback : fallback;
  };

  const budgetSelect = scope.match(/<select[^>]*name="budget"[^>]*>([\s\S]*?)<\/select>/);
  const budgetOptions = budgetSelect
    ? [...budgetSelect[1]!.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/g)]
        .map((m) => stripTags(m[1]!))
        .filter((v) => v && !/^select a/i.test(v))
    : [];

  return {
    title: 'Get a free consultation',
    submitLabel: extractSubmitLabel(html),
    serviceLabel: label('service', 'Service required'),
    serviceOptions: extractServiceOptions(html),
    budgetLabel: label('budget', 'Approximate budget'),
    budgetOptions,
    budgetNote: stripTags(scope.match(/<span class="budget-note">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    detailsLabel: label('details', 'Project details'),
    detailsPlaceholder: decodeEntities(
      scope.match(/<textarea[^>]*name="details"[^>]*placeholder="([^"]*)"/)?.[1] ?? '',
    ),
    reassurance: stripTags(scope.match(/<p class="reassure">([\s\S]*?)<\/p>/)?.[1] ?? ''),
  };
}

async function seedCaseStudies(): Promise<number> {
  const html = readSource('aptentech-Portfolio.html');
  const js = inlineScript(html);
  const cases = readCases(js);
  const shotConsole = readShotConsole(js);
  let count = 0;

  for (const [index, c] of cases.entries()) {
    // Derive a slug from the detail href the source already specified, so the intended
    // /case-studies/<slug>/ URLs are preserved rather than invented.
    const fromHref = c.detailHref?.replace(/\/$/, '').split('/').pop() ?? '';
    const slug = fromHref || `case-study-${index + 1}`;

    await CaseStudyModel.findOneAndUpdate(
      { slug },
      {
        $set: {
          slug,
          accent: c.accent,
          industry: c.industry,
          techSummary: c.techSummary,
          tag: c.tag,
          title: c.title,
          problem: c.problem,
          solution: c.solution,
          result: c.result,
          metrics: c.metrics,
          shot: c.shot,
          shotConsole,
          detailHref: c.detailHref,
          technologies: c.techSummary.split('·').map((t) => t.trim()).filter(Boolean),
          category: c.industry,
          projectUrl: '',
          featured: index < 3,
          showInIndex: true,
          order: index,
          status: 'PUBLISHED',
          images: [],
          seo: { title: c.title, description: c.problem.slice(0, 300), canonical: c.detailHref ?? '' },
        },
      },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

/**
 * Reading time in whole minutes, at 200 words per minute and never less than one.
 *
 * The source printed `[N] min read` as a placeholder. This is derived from the article
 * itself rather than invented, and updates as an editor writes.
 */
/**
 * The byline role the article template shows under the author's name.
 *
 * The source never named a real author, so the placeholder travels across unchanged; the
 * CMS is where a real name and role are set before launch.
 */
const ARTICLE_AUTHOR_ROLE = '[AUTHOR ROLE]';

/** The author-box bio, kept as the placeholder the template shipped. */
const ARTICLE_AUTHOR_BIO =
  '[AUTHOR BIO — one or two sentences establishing why this person is credible on this topic. ' +
  'Named authors with real credentials are a ranking and AI-citation signal, so this block is not decoration.]';

function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

async function seedBlog(): Promise<{ posts: number; categories: number }> {
  const listing = readSource('aptentech-blog.html');
  const posts = readPosts(inlineScript(listing));
  const listingImages = readImages(listing);

  const categoryNames = [...new Set(posts.map((p) => p.categoryName).filter(Boolean))];
  for (const name of categoryNames) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await BlogCategoryModel.findOneAndUpdate(
      { slug },
      { $set: { slug, name, description: '', seo: { title: `${name} articles`, description: '' } } },
      { upsert: true },
    );
  }

  let count = 0;
  for (const [index, p] of posts.entries()) {
    const slug = p.href.replace(/\/$/, '').split('/').pop() ?? `post-${index + 1}`;
    const cover = index === 0 && listingImages[0]
      ? mediaFrom(listingImages[0].src, listingImages[0].alt, listingImages[0].width, listingImages[0].height)
      : mediaFrom(`/images/blog/${slug}.jpg`, p.title, 760, 520);

    const publishedAt = p.isoDate ? new Date(p.isoDate) : null;

    await BlogPostModel.findOneAndUpdate(
      { slug },
      {
        $set: {
          slug,
          accent: p.accent,
          title: p.title,
          excerpt: p.excerpt,
          // The source listing carries titles and excerpts only; article bodies were never
          // written. Each post is seeded with its real excerpt and left for an editor to
          // complete rather than filled with invented prose.
          body: `<p>${p.excerpt}</p>`,
          categoryName: p.categoryName,
          tags: [p.categoryName].filter(Boolean),
          authorName: p.authorName,
          authorRole: ARTICLE_AUTHOR_ROLE,
          authorBio: ARTICLE_AUTHOR_BIO,
          coverImage: cover,
          readingMinutes: readingMinutes(p.excerpt),
          status: 'PUBLISHED',
          publishedAt,
          faqs: [],
          seo: { title: `${p.title} | Aptentech`, description: p.excerpt.slice(0, 300), canonical: `https://aptentech.com/blog/${slug}/` },
        },
      },
      { upsert: true },
    );
    count += 1;
  }

  return { posts: count, categories: categoryNames.length };
}

/**
 * The blog listing's featured article.
 *
 * It is written directly into the page markup rather than sitting in the `POSTS` array, so
 * reading only that array would lose it. Seeding it as a real post puts it under the same
 * CMS control as every other article and keeps its `/blog/<slug>/` URL working.
 */
async function seedFeaturedPost(): Promise<number> {
  const html = readSource('aptentech-blog.html');

  const block = html.match(/<div class="feat-body">([\s\S]*?)<\/div>\s*<\/article>/);
  if (!block) return 0;

  const inner = block[1] ?? '';
  const link = inner.match(/<h2><a href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/);
  if (!link) return 0;

  const slug = (link[1] ?? '').replace(/\/$/, '').split('/').pop() ?? '';
  if (!slug) return 0;

  const images = readImages(html);
  const cover = images[0]
    ? mediaFrom(images[0].src, images[0].alt, images[0].width, images[0].height)
    : { ...EMPTY_MEDIA };

  const excerpt = stripTags(inner.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '');
  const published = inner.match(/<time datetime="([^"]*)"/)?.[1] ?? null;
  const title = stripTags(link[2] ?? '');

  await BlogPostModel.findOneAndUpdate(
    { slug },
    {
      $set: {
        slug,
        accent: 'indigo',
        title,
        excerpt,
        // The source never wrote a body for this article, only the standfirst; an editor
        // completes it rather than having prose invented here.
        body: `<p>${excerpt}</p>`,
        categoryName: stripTags(inner.match(/<span class="cat">([\s\S]*?)<\/span>/)?.[1] ?? ''),
        tags: [],
        // The byline nests the avatar span inside `.by`, so the outer span has to be
        // matched to its real closing tag rather than the first one encountered.
        authorName: stripTags(inner.match(/<span class="by">[\s\S]*?<\/span>([\s\S]*?)<\/span>/)?.[1] ?? '').trim(),
        authorRole: ARTICLE_AUTHOR_ROLE,
          authorBio: ARTICLE_AUTHOR_BIO,
        coverImage: cover,
        readingMinutes: readingMinutes(excerpt),
        status: 'PUBLISHED',
        publishedAt: published ? new Date(published) : null,
        faqs: [],
        seo: {
          title: `${title} | Aptentech`,
          description: excerpt.slice(0, 300),
          canonical: `https://aptentech.com/blog/${slug}/`,
        },
      },
    },
    { upsert: true },
  );

  return 1;
}

async function seedTestimonials(): Promise<number> {
  const html = readSource('aptentech-homepage.html');
  const items = extractTestimonials(html);
  let count = 0;

  for (const [index, t] of items.entries()) {
    await TestimonialModel.findOneAndUpdate(
      { sourceKey: `home#${index}` },
      {
        $set: {
          sourceKey: `home#${index}`,
          name: t.name,
          designation: t.designation,
          company: t.company,
          content: t.content,
          industry: t.industry,
          duration: t.duration,
          rating: 5,
          photo: { ...EMPTY_MEDIA },
          attachedTo: [],
          order: index,
          visible: true,
        },
      },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function seedFaqs(): Promise<number> {
  const html = readSource('aptentech-homepage.html');
  const faqs = readFaqs(inlineScript(html));
  let count = 0;

  for (const [index, f] of faqs.entries()) {
    await FaqModel.findOneAndUpdate(
      { question: f.question },
      { $set: { ...f, order: index, attachedTo: ['home'] } },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

/**
 * Splits a page's <main> into its top-level <section> elements, in document order.
 *
 * Depth-aware, because sections contain nested markup that a naive split would cut through.
 */
function topLevelSections(html: string): Array<{ id: string; html: string }> {
  const main = html.match(/<main[^>]*>([\s\S]*)<\/main>/);
  const body = main?.[1] ?? html;

  const out: Array<{ id: string; html: string }> = [];
  let depth = 0;
  let startIndex = -1;
  let openTag = '';

  for (const m of body.matchAll(/<(\/?)section([\s>])/g)) {
    const closing = m[1] === '/';
    if (!closing) {
      if (depth === 0) {
        startIndex = m.index!;
        openTag = body.slice(m.index!, body.indexOf('>', m.index!) + 1);
      }
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        out.push({
          id: openTag.match(/\bid="([^"]*)"/)?.[1] ?? '',
          html: body.slice(startIndex, m.index!),
        });
        startIndex = -1;
      }
    }
  }
  return out;
}

/** Maps a section's DOM id to the block type that renders it. */
const BLOCK_FOR_SECTION: Readonly<Record<string, string>> = {
  results: 'statsBar',
  stats: 'statsBar',
  services: 'serviceGrid',
  work: 'portfolioGrid',
  portfolio: 'portfolioGrid',
  cases: 'portfolioGrid',
  testimonials: 'testimonialSection',
  faq: 'faqSection',
  blog: 'blogSection',
  contact: 'leadFormSection',
  offices: 'officeGrid',
  compliance: 'complianceBadges',
  ai: 'technologySection',
  tech: 'technologySection',
  solutions: 'solutionsBento',
  process: 'processSection',
  how: 'processSection',
};

async function seedPages(): Promise<number> {
  let count = 0;

  for (const src of PAGE_SOURCES) {
    const html = readSource(src.file);
    const meta = readMeta(html);
    const images = readImages(html);
    const js = inlineScript(html);
    let pageCaseStudyIds: Types.ObjectId[] = [];
    let pageTestimonialIds: Types.ObjectId[] = [];
    let pageInsightIds: Types.ObjectId[] = [];

    const blocks: Array<Record<string, unknown>> = [
      {
        key: 'hero',
        type: 'hero',
        enabled: true,
        eyebrow: meta.eyebrow,
        title: meta.h1,
        body: meta.heroLede,
        ctas: [],
        image: images[0] ? mediaFrom(images[0].src, images[0].alt, images[0].width, images[0].height) : { ...EMPTY_MEDIA },
        onDark: src.slug === 'home',
      },
    ];

    // The inline hero form's own heading, where the page has one.
    const heroFormTitle = textOfClass(html, 'h2', 'hf-title');
    if (heroFormTitle) {
      blocks.push({
        key: 'hero-form',
        type: 'leadFormSection',
        enabled: true,
        title: heroFormTitle,
        body: textOfClass(html, 'p', 'hf-sub'),
        submitLabel: 'Submit your requirement',
        serviceOptions: [],
        limit: 0,
      });
    }

    /**
     * Walk the page's own sections in order.
     *
     * Each becomes a block of the closest matching type, keeping its heading, standfirst
     * and — for the sections whose data lived in JavaScript — its items. Anything without
     * a specific type becomes a text section so its copy survives and stays editable
     * rather than being dropped.
     */
    for (const section of topLevelSections(html)) {
      const headingMatch = section.html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
      const title = headingMatch ? stripTags(headingMatch[1]!) : '';
      if (!title) continue;

      const eyebrow = stripTags(section.html.match(/<span class="eyebrow"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');
      const lede = stripTags(section.html.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
      const type = BLOCK_FOR_SECTION[section.id] ?? 'textSection';

      const block: Record<string, unknown> = {
        key: section.id || `section-${blocks.length}`,
        type,
        enabled: true,
        eyebrow,
        title,
        body: lede,
      };

      switch (type) {
        case 'statsBar':
          block.stats = extractStats(section.html);
          block.body = textOfClass(section.html, 'p', 'ks') || lede;
          break;
        case 'serviceGrid':
          block.items = readServices(js, icons);
          break;
        case 'solutionsBento':
          block.items = readSolutions(js, icons);
          break;
        case 'technologySection':
          block.items = readTechnologies(js, icons);
          break;
        case 'processSection':
          block.steps = readSteps(js);
          break;
        case 'complianceBadges':
          block.badges = readBadges(js, icons);
          break;
        case 'faqSection':
          block.faqs = readFaqs(js);
          block.emitSchema = true;
          break;
        case 'portfolioGrid':
        case 'testimonialSection':
        case 'blogSection':
          block.limit = 12;
          break;
        case 'leadFormSection':
          block.submitLabel = extractSubmitLabel(html);
          block.serviceOptions = extractServiceOptions(html);
          block.limit = 0;
          break;
        case 'officeGrid':
          block.offices = [...section.html.matchAll(/<div class="office"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="office"|<\/)/g)]
            .map((m) => {
              const inner = m[1] ?? '';
              return {
                city: stripTags(inner.match(/<div class="k">([\s\S]*?)<\/div>/)?.[1] ?? ''),
                lines: [...inner.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((p) => stripTags(p[1]!)).filter(Boolean),
              };
            })
            .filter((o) => o.city || o.lines.length);
          break;
        default:
          break;
      }

      blocks.push(block);
    }

    // The about page is a one-off composition of thirteen bands. Reading them individually
    // keeps the statistics panel, values grid, principles list, client marquee, recognition
    // band and office cards that the generic extraction had flattened into prose.
    if (src.slug === 'about') {
      pageTestimonialIds = await seedPageTestimonials('about', html);
      pageInsightIds = await seedPageInsights(html);
      blocks.length = 0;
      blocks.push(
        { key: 'hero', type: 'aboutHero', enabled: true, ...readAboutHero(html, icons) },
        { key: 'stats', type: 'statsPanel', enabled: true, ...readStatsPanel(html) },
        { key: 'story', type: 'storyBand', enabled: true, ...readStoryBand(html), image: { ...EMPTY_MEDIA } },
        { key: 'values', type: 'valueGrid', enabled: true, ...readValueGrid(html, icons) },
        { key: 'how', type: 'principleList', enabled: true, ...readPrincipleList(html) },
        { key: 'brands', type: 'brandStrip', enabled: true, ...readBrandStripBand(html) },
        {
          key: 'awards',
          type: 'awardsBand',
          enabled: true,
          ...readBandHead(html, 'awards'),
          awardLead: readAwards(html, icons).lead,
          awards: readAwards(html, icons).items,
        },
        {
          key: 'compliance',
          type: 'complianceBadges',
          enabled: true,
          ...readBandHead(html, 'compliance'),
          badges: readBadges(js, icons),
        },
        { key: 'testimonials', type: 'testimonialSection', enabled: true, ...readBandHead(html, 'testimonials'), limit: 6 },
        { key: 'offices', type: 'officeCards', enabled: true, ...readOfficeCards(html) },
        { key: 'careers', type: 'ctaSection', enabled: true, ...readStripBand(html, 'car-h2') },
        { key: 'blog', type: 'latestInsights', enabled: true, ...readLatestInsights(html), limit: 3 },
        {
          key: 'contact',
          type: 'leadFormSection',
          enabled: true,
          ...readLeadBand(html, icons),
          leadForm: extractLeadForm(html),
          limit: 0,
        },
      );
    }

    // The home page, likewise: thirteen bands, each with its own markup in the source.
    if (src.slug === 'home') {
      pageCaseStudyIds = await seedPageCaseStudies('home', js);
      pageTestimonialIds = await seedPageTestimonials('home', html);
      pageInsightIds = await seedPageInsights(html);
      blocks.length = 0;
      blocks.push(
        { key: 'hero', type: 'homeHero', enabled: true, ...readHomeHero(html) },
        { key: 'results', type: 'statsPanel', enabled: true, ...readStatsPanel(html) },
        { key: 'why', type: 'whyGrid', enabled: true, ...readWhyGrid(html, icons) },
        {
          key: 'services',
          type: 'serviceTabs',
          enabled: true,
          ...readBandHead(html, 'services'),
          items: readServices(js, icons),
        },
        { key: 'work', type: 'caseCarousel', enabled: true, ...readCaseBand(html), limit: 12 },
        { key: 'testimonials', type: 'testimonialSection', enabled: true, ...readBandHead(html, 'testimonials'), limit: 6 },
        {
          key: 'awards',
          type: 'awardsBand',
          enabled: true,
          ...readBandHead(html, 'awards'),
          awardLead: readAwards(html, icons).lead,
          awards: readAwards(html, icons).items,
        },
        {
          key: 'tech',
          type: 'techTabs',
          enabled: true,
          ...readBandHead(html, 'tech'),
          centred: /<div class="sect-head center">/.test(sectionByIdOrClass(html, 'tech')),
          groups: readTechStack(js),
        },
        { key: 'ai', type: 'aiGrid', enabled: true, ...readBandHead(html, 'ai'), items: readTechnologies(js, icons) },
        { key: 'strategy', type: 'ctaSection', enabled: true, ...readStripBand(html, 'strip-h2') },
        { key: 'faq', type: 'faqShell', enabled: true, ...readFaqShell(html), faqs: readFaqs(js), emitSchema: true },
        { key: 'blog', type: 'latestInsights', enabled: true, ...readLatestInsights(html), limit: 3 },
        {
          key: 'contact',
          type: 'leadFormSection',
          enabled: true,
          ...readLeadBand(html, icons),
          leadForm: extractLeadForm(html),
          limit: 0,
        },
      );
    }

    // The blog listing is a hero with a featured guide above a two-column shell, not a
    // hero plus cards; only its copy is stored, because the articles come from the CMS.
    if (src.slug === 'blog') {
      blocks.length = 0;
      blocks.push(
        { key: 'hero', type: 'blogHero', enabled: true, ...readBlogHero(html) },
        // The article template's wording is stored beside the listing it belongs to.
        {
          key: 'article-template',
          type: 'articleTemplate',
          enabled: true,
          ...readArticleTemplate(readSource('aptentech-blog-detail.html')),
        },
      );
    }

    // The case-study page is its own design too: a statistics hero, the full-width study
    // list the source built in JavaScript, and the shared lead band.
    if (src.slug === 'case-studies') {
      blocks.length = 0;
      blocks.push(
        { key: 'hero', type: 'portfolioHero', enabled: true, ...readPortfolioHero(html) },
        { key: 'work', type: 'caseStudyList', enabled: true, ...readPortfolioList(html), limit: 12 },
        {
          key: 'contact',
          type: 'leadFormSection',
          enabled: true,
          ...readLeadBand(html, icons),
          leadForm: extractLeadForm(html),
          limit: 0,
        },
      );
    }

    // The contact page is its own design — a lead banner, four numbered steps, four routes
    // to a person and the office cards — not a hero plus prose, so it is read band by band.
    if (src.slug === 'contact') {
      blocks.length = 0;
      blocks.push(
        {
          key: 'banner',
          type: 'contactBanner',
          enabled: true,
          ...readContactBanner(html, icons),
          // The form sits inside this band in the source, so its configuration travels with it.
          leadForm: extractLeadForm(html),
        },
        { key: 'next', type: 'stepGrid', enabled: true, ...readStepGrid(html) },
        { key: 'routes', type: 'routeGrid', enabled: true, ...readRouteGrid(html, icons) },
        { key: 'offices', type: 'officeCards', enabled: true, ...readOfficeCards(html) },
      );
    }

    // Legal pages are one long structured document rather than a stack of design blocks,
    // so they replace the block list entirely with a single legal-document block that
    // keeps the source's clause numbering, anchors, cards and table of contents.
    if (src.slug === 'privacy-policy' || src.slug === 'terms-conditions') {
      blocks.length = 0;
      blocks.push({ key: 'legal', type: 'legalDocument', enabled: true, ...readLegalDocument(html, meta.h1) });
    }

    await SitePageModel.findOneAndUpdate(
      { slug: src.slug },
      {
        $set: {
          slug: src.slug,
          title: src.label,
          status: 'PUBLISHED',
          caseStudyIds: pageCaseStudyIds,
          testimonialIds: pageTestimonialIds,
          latestPostIds: pageInsightIds,
          blocks,
          seo: {
            title: meta.title,
            description: meta.description,
            canonical: meta.canonical,
            ogTitle: meta.ogTitle,
            ogDescription: meta.ogDescription,
            ogImage: { ...EMPTY_MEDIA },
            robotsIndex: true,
            robotsFollow: true,
          },
        },
      },
      { upsert: true },
    );
    count += 1;
  }

  return count;
}

/**
 * Reads a legal page as the document it is.
 *
 * The body is taken whole rather than reassembled: the clauses nest definition cards,
 * sub-headings and lists that the stylesheet targets together, and an earlier pass that
 * kept only the block-level tags dropped the clause numbers, the section anchors and both
 * definition cards. `clauses` mirrors the anchors so the contents list — which the source
 * built in JavaScript — can be rendered on the server instead.
 */
function readLegalDocument(html: string, heading: string) {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';

  const hero = main.match(/<section class="legal-hero"[\s\S]*?<\/section>/)?.[0] ?? '';
  const metaBlock = hero.match(/<div class="legal-meta">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const notice = main.match(/<div class="legal-notice">([\s\S]*?)<\/div>/)?.[1] ?? '';

  // `.legal-body` runs to the end of the shell, so it is taken by locating its opening tag
  // and cutting at the wrapper that follows rather than by a non-greedy tag match, which
  // would stop at the first nested </div>.
  const bodyStart = main.indexOf('<div class="legal-body">');
  const bodyHtml =
    bodyStart < 0
      ? ''
      : main
          .slice(bodyStart + '<div class="legal-body">'.length)
          .split(/<\/div>\s*<\/div>\s*<\/div>\s*<\/section>/)[0] ?? '';

  return {
    heading: heading || stripTags(hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''),
    meta: [...metaBlock.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => stripTags(m[1]!)).filter(Boolean),
    notice: notice.trim(),
    tocLabel: stripTags(main.match(/<nav class="legal-toc"[\s\S]*?<p class="k">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    bodyHtml: bodyHtml.trim(),
    clauses: [...bodyHtml.matchAll(/<section id="([^"]+)">\s*<h2><span class="n">([\s\S]*?)<\/span>([\s\S]*?)<\/h2>/g)].map(
      (m) => ({ id: m[1] ?? '', number: stripTags(m[2] ?? ''), title: stripTags(m[3] ?? '') }),
    ),
  };
}

async function seedSettings(): Promise<void> {
  // Seeded from a service page rather than the homepage: both carry the same mega-menu,
  // but the homepage's links are on-page anchors (`#services`) while the inner pages use
  // real paths (`/services/`), which is the more useful starting point for the CMS.
  //
  // This particular page is used because its header, mobile and footer CTAs all read
  // "Get a Free Consultation", which 21 of the 25 pages share. Four pages override the
  // chrome CTA with an audit-specific label ("Get my free SEO audit"); seeding from one of
  // those would have put a single page's wording on every page of the site.
  const html = readSource('aptentech-software-development.html');
  const nav = extractNavigation(html, icons);

  const homepage = readSource('aptentech-homepage.html');
  const email = homepage.match(/mailto:([^"]*)"/)?.[1] ?? '';
  const phone = homepage.match(/tel:([^"]*)"/)?.[1] ?? '';
  const tagline = stripTags(homepage.match(/<footer[\s\S]*?<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/)?.[1] ?? '');

  await SiteSettingsModel.findOneAndUpdate(
    { singleton: 'site' },
    {
      $set: {
        companyName: 'Aptentech',
        logo: { ...EMPTY_MEDIA },
        favicon: { ...EMPTY_MEDIA },
        // Placeholders preserved exactly as the source has them — no invented contact details.
        email: decodeEntities(email),
        phone: decodeEntities(phone),
        addressLines: ['[OFFICE ADDRESS LINE 1]'],
        offices: [],
        socials: nav.socials,
        navigation: nav.groups,
        mobileNavigation: nav.mobileNavigation,
        // Same reasoning as the header CTA below: site-wide chrome cannot rely on an
        // in-page anchor that only the service and solution pages have.
        mobileNavCta: nav.mobileNavCta ? { ...nav.mobileNavCta, href: '/contact/' } : null,
        // The source points this at the in-page `#contact` band, which does not exist on
        // every page. It is seeded at the real contact route so the button works site-wide.
        headerCta: { label: 'Free Consultation', href: '/contact/', style: 'primary' },
        footerColumns: nav.footerColumns,
        footerCta: nav.footerCta ? { ...nav.footerCta, href: '/contact/' } : null,
        footerTagline: tagline,
        legalLinks: [
          { label: 'Privacy Policy', href: '/privacy-policy/' },
          { label: 'Terms & Conditions', href: '/terms-conditions/' },
          { label: 'Sitemap', href: '/sitemap.xml' },
        ],
        defaultSeo: {
          title: 'Aptentech — AI, Software & Cloud Engineering Company',
          description:
            'Aptentech builds AI systems, software products and cloud platforms for startups, SMEs and enterprises — from first architecture call to production scale.',
          canonical: 'https://aptentech.com/',
          ogTitle: '',
          ogDescription: '',
          ogImage: { ...EMPTY_MEDIA },
          robotsIndex: true,
          robotsFollow: true,
        },
        analytics: { gaMeasurementId: '', gtmContainerId: '', enabled: false },
      },
    },
    { upsert: true },
  );
}

/**
 * The three section indexes the mega-menu points at.
 *
 * Their wording comes from the home page's own bands wherever the source wrote it — the
 * services copy is the homepage's "What we build" band, which literally says each capability
 * "links to a dedicated service page". The solutions index has no equivalent in the source,
 * so its standfirst is left empty for AptenTech to write rather than invented here.
 */
async function seedIndexPages(): Promise<number> {
  const home = readSource('aptentech-homepage.html');
  const js = inlineScript(home);

  const services = readBandHead(home, 'services');
  const tech = readBandHead(home, 'tech');

  const pages = [
    {
      slug: 'services-index',
      title: 'Services',
      path: '/services/',
      block: { crumbLabel: 'Services', eyebrow: services.eyebrow, title: services.title, lede: services.lede },
      description: services.lede,
    },
    {
      slug: 'solutions-index',
      title: 'Solutions',
      path: '/solutions/',
      // The source never wrote a site-level standfirst for this band; an editor supplies one.
      block: { crumbLabel: 'Solutions', eyebrow: '', title: 'Solutions', lede: '' },
      description: '',
    },
    {
      slug: 'industries-index',
      title: 'Industries',
      path: '/industries/',
      // The Industries menu is a group of eight; the source wrote no standfirst for it, so an
      // editor supplies one rather than one being invented here.
      block: { crumbLabel: 'Industries', eyebrow: '', title: 'Industries', lede: '' },
      description: '',
    },
    {
      slug: 'technologies-index',
      title: 'Technologies',
      path: '/technologies/',
      block: {
        crumbLabel: 'Technologies',
        eyebrow: tech.eyebrow,
        title: tech.title,
        lede: tech.lede,
        groups: readTechStack(js),
      },
      description: tech.lede,
    },
  ];

  for (const page of pages) {
    await SitePageModel.findOneAndUpdate(
      { slug: page.slug },
      {
        $set: {
          slug: page.slug,
          title: page.title,
          status: 'PUBLISHED',
          blocks: [{ key: 'index', type: 'pageIndex', enabled: true, ...page.block }],
          seo: {
            title: `${page.title} | Aptentech`,
            description: page.description.slice(0, 300),
            canonical: `https://aptentech.com${page.path}`,
            ogTitle: '',
            ogDescription: '',
            ogImage: { ...EMPTY_MEDIA },
            robotsIndex: true,
            robotsFollow: true,
          },
        },
      },
      { upsert: true },
    );
  }

  return pages.length;
}

async function seedRedirects(): Promise<number> {
  // The footer linked "Blog", "Insights" and "Guides" to /insights/ on 24 of 25 pages,
  // while every canonical and article link used /blog/. One had to win; /blog/ did,
  // because it is what the canonicals declare. This keeps the other path resolving.
  const redirects = [
    { from: '/insights/', to: '/blog/', statusCode: 301, active: true },

    /*
      Every menu path now has a page, so none of the old stubs is listed here any more.

      `/solutions/ai-automation/` is kept as a redirect rather than deleted: 216 links in the
      source pointed at it, so it may already be indexed, and it now leads to the page that
      actually covers it instead of to a band on the home page.
    */
    { from: '/solutions/ai-automation/', to: '/services/ai-automation/', statusCode: 301, active: true },

    // The case-study index's "view portfolio" button and the per-study detail links. The
    // source declared these URLs but never designed the pages behind them.
    { from: '/case-studies/all/', to: '/case-studies/', statusCode: 301, active: true },

    // The about page's careers strip. There is no careers page in the source either.
    { from: '/careers/', to: '/contact/', statusCode: 301, active: true },
  ];

  // Each portfolio study declared its own detail URL. Until those pages exist, the link
  // returns the reader to the index rather than a 404.
  for (const study of await CaseStudyModel.find({ showInIndex: true }).select('slug').lean()) {
    redirects.push({ from: `/case-studies/${study.slug}/`, to: '/case-studies/', statusCode: 301, active: true });
  }

  for (const r of redirects) {
    await RedirectModel.findOneAndUpdate({ from: r.from }, { $set: r }, { upsert: true });
  }

  /*
    Rows the seed no longer writes are removed, not left behind. `/services/` and
    `/technologies/` were redirects until those pages were built; an upsert-only seed would
    have kept redirecting past the new pages, which is exactly what happened once.

    A redirect an administrator added by hand is left alone — only seeded paths are pruned.
  */
  const SEEDED_PATHS = [
    '/insights/',
    '/services/',
    '/technologies/',
    '/solutions/',
    '/solutions/ai-automation/',
    '/case-studies/all/',
    '/careers/',
  ];
  const keep = redirects.map((r) => r.from);
  await RedirectModel.deleteMany({
    from: trusted({ $in: SEEDED_PATHS.filter((path) => !keep.includes(path)) }),
  });

  return redirects.length;
}

/**
 * Writes the icon registry consumed by the web app.
 *
 * Icons are design, so they live in the codebase rather than the database; content only
 * stores the key. This file is generated from the exact SVG bodies found in the source,
 * which is what keeps the icon set pixel-identical.
 */
function writeIconRegistry(): number {
  const registry = icons.registry();
  const target = path.resolve(__dirname, '../../../web/src/components/shared/iconRegistry.generated.ts');

  const entries = Object.entries(registry)
    .map(([key, body]) => `  ${key}: ${JSON.stringify(body)},`)
    .join('\n');

  const contents = `/**
 * Generated by \`npm run seed\` from the original AptenTech HTML. Do not edit by hand.
 *
 * Maps an icon key to the exact inline SVG body used by the approved design. Content in
 * MongoDB references these keys, so the CMS can choose an icon without ever storing raw
 * SVG — which keeps the icon set under design control and removes an HTML-injection sink.
 */
export const ICON_REGISTRY: Readonly<Record<string, string>> = {
${entries}
};

export type IconKey = keyof typeof ICON_REGISTRY;
`;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
  return Object.keys(registry).length;
}

/* ------------------------------------------------------------------ main */

async function main(): Promise<void> {
  const dir = sourceDir();
  logger.info({ dir }, 'Seeding from original HTML');

  // Fail before touching the database if any source file is missing, rather than seeding
  // a partial site that looks complete.
  const missing = ALL_SOURCE_FILES.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    throw new Error(`Missing ${missing.length} source file(s): ${missing.join(', ')}`);
  }

  await connectDb();
  await syncIndexes();

  const servicePages = await seedServicePages();
  const pages = await seedPages();
  const caseStudies = await seedCaseStudies();
  const blog = await seedBlog();
  const featured = await seedFeaturedPost();
  const testimonials = await seedTestimonials();
  const faqs = await seedFaqs();
  const indexPages = await seedIndexPages();
  const redirects = await seedRedirects();
  await seedSettings();
  const emailTemplates = await seedEmailTemplates();
  // After the source pages exist: every generated page draws its copy from one of them.
  const menuPages = await seedMenuPages();
  // Last: every image slot must exist before assets can be pointed at them.
  const images = await attachDemoImages();
  // Last of all: the source content has to exist before its placeholders can be filled.
  const demoContent = await seedDemoContent();
  const iconCount = writeIconRegistry();

  // Nothing is attached site-wide any more: case studies, testimonials and the insight
  // cards are all page-specific in the source, and are seeded with the page that carries them.

  logger.info(
    {
      servicePages,
      pages: pages + indexPages,
      caseStudies,
      // Totals, not just what the primary seeders wrote: every service and solution page
      // also contributes its own three articles, three testimonials and four case studies.
      blogPosts: await BlogPostModel.countDocuments(),
      caseStudiesTotal: await CaseStudyModel.countDocuments(),
      testimonialsTotal: await TestimonialModel.countDocuments(),
      blogCategories: blog.categories,
      testimonials,
      faqs,
      redirects,
      emailTemplates,
      menuPages,
      images,
      demoContent,
      icons: iconCount,
      sourceFiles: ALL_SOURCE_FILES.length,
    },
    'Seed complete',
  );

  await disconnectDb();
}

main().catch(async (err) => {
  logger.fatal({ err }, 'Seed failed');
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
