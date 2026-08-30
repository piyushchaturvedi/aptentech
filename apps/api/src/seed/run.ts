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
import { Types } from 'mongoose';
import path from 'node:path';
import { connectDb, disconnectDb } from '../config/db';
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
  readShotConsole,
  readSolutionsCta,
  readWhyAndFaqExtras,
} from './extractSections';
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

  return { groups, mobileNavigation, mobileNavCta, footerColumns, socials, footerCta };
}

/* ------------------------------------------------------------------ seeders */

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
      testimonialIds: [],
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
          coverImage: cover,
          readingMinutes: 0,
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
        authorName: stripTags(inner.match(/<span class="by">([\s\S]*?)<\/span>/)?.[1] ?? '')
          .replace('[AV]', '')
          .trim(),
        coverImage: cover,
        readingMinutes: 0,
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
      { name: t.name, content: t.content },
      {
        $set: {
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
                lines: [...inner.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((p) => stripTags(p[1]!)).filter(Boolean),
              };
            })
            .filter((o) => o.city || o.lines.length);
          break;
        default:
          break;
      }

      blocks.push(block);
    }

    // Legal pages are one long document; the whole body is kept as a single section so the
    // clause structure and ordering survive exactly.
    if (src.slug === 'privacy-policy' || src.slug === 'terms-conditions') {
      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
      blocks.length = 1;
      blocks.push({
        key: 'legal',
        type: 'legalSection',
        enabled: true,
        title: meta.h1,
        html: main ? extractLegalHtml(main[1]!) : '',
      });
    }

    await SitePageModel.findOneAndUpdate(
      { slug: src.slug },
      {
        $set: {
          slug: src.slug,
          title: src.label,
          status: 'PUBLISHED',
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

/** Keeps the legal document's headings, paragraphs and lists; drops layout wrappers. */
function extractLegalHtml(main: string): string {
  const sections = [...main.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/g)].map((m) => m[1] ?? '');
  const source = sections.length ? sections.join('\n') : main;

  const kept = [...source.matchAll(/<(h2|h3|h4|p|ul|ol)[^>]*>[\s\S]*?<\/\1>/g)].map((m) => m[0]);
  return kept
    .join('\n')
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/\sid="[^"]*"/g, '')
    .replace(/\sstyle="[^"]*"/g, '');
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
  const tagline = stripTags(homepage.match(/<footer[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');

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

async function seedRedirects(): Promise<number> {
  // The footer linked "Blog", "Insights" and "Guides" to /insights/ on 24 of 25 pages,
  // while every canonical and article link used /blog/. One had to win; /blog/ did,
  // because it is what the canonicals declare. This keeps the other path resolving.
  const redirects = [{ from: '/insights/', to: '/blog/', statusCode: 301, active: true }];

  for (const r of redirects) {
    await RedirectModel.findOneAndUpdate({ from: r.from }, { $set: r }, { upsert: true });
  }
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
  const redirects = await seedRedirects();
  await seedSettings();
  const iconCount = writeIconRegistry();

  const allTestimonialIds = (await TestimonialModel.find().select('_id').lean()).map((d) => d._id);
  // Case studies are attached per page from each page's own CASES array while it is
  // seeded; only the testimonial grid was genuinely shared across pages in the source.
  await ServicePageModel.updateMany({}, { $set: { testimonialIds: allTestimonialIds.slice(0, 6) } });

  logger.info(
    {
      servicePages,
      pages,
      caseStudies,
      blogPosts: blog.posts + featured,
      blogCategories: blog.categories,
      testimonials,
      faqs,
      redirects,
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
