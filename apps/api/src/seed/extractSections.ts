/**
 * Extracts the remaining section content from a source page.
 *
 * These readers exist because a DOM comparison against the original rendered pages found
 * roughly eighty structural elements the first migration pass had not captured — the logo
 * marquee, the numbered "protect" band, the market tiles, the recognition panel, the cost
 * table, the lead-form reasons and offices, and a standfirst paragraph under almost every
 * heading. Each reader below is written against the actual markup of those bands.
 */
import { accentFromHex, type AccentToken } from '@aptentech/shared';
import { IconCollector, decodeEntities, stripTags } from './extract';

/** Returns the outer HTML of a `<section>` identified by id, or by a class when it has none. */
export function sectionByIdOrClass(html: string, idOrClass: string): string {
  const byId = html.match(new RegExp(`<section[^>]*\\bid="${idOrClass}"[\\s\\S]*?</section>`));
  if (byId) return byId[0];

  const byClass = html.match(new RegExp(`<section[^>]*class="[^"]*\\b${idOrClass}\\b[^"]*"[\\s\\S]*?</section>`));
  return byClass?.[0] ?? '';
}

/** Reads the `.lede` directly under a section's heading. */
function ledeOf(block: string): string {
  const lede = block.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if (lede) return stripTags(lede);

  // The FAQ band wraps its heading in `.faq-head`, where the standfirst carries only the
  // reveal classes and not `.lede`. Fall back to the paragraph straight after the heading,
  // but only inside that wrapper, so ordinary body copy is never mistaken for a standfirst.
  if (!/class="faq-head"/.test(block)) return '';
  return stripTags(block.match(/<h2[^>]*>[\s\S]*?<\/h2>\s*<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/)?.[1] ?? '');
}

/**
 * The standfirst under every band's heading, keyed by the section it belongs to.
 *
 * Keys match the renderer's section keys so a lede can be looked up without another map.
 */
export function readSectionLedes(html: string): Record<string, string> {
  const map: Array<[string, string]> = [
    ['protect', 'protect'],
    ['positioning', 'overview'],
    ['marketContext', 'market'],
    ['services', 'services'],
    ['recognition', 'awards'],
    ['solutions', 'solutions'],
    ['caseStudies', 'portfolio'],
    ['testimonials', 'testimonials'],
    ['features', 'features'],
    ['technologies', 'ai'],
    ['compliance', 'compliance'],
    ['process', 'process'],
    ['pricing', 'cost'],
    ['techStack', 'tech'],
    ['why', 'why'],
    ['faqs', 'faq'],
    ['latestInsights', 'blog'],
    ['leadForm', 'contact'],
  ];

  const out: Record<string, string> = {};
  for (const [key, sectionId] of map) {
    const lede = ledeOf(sectionByIdOrClass(html, sectionId));
    if (lede) out[key] = lede;
  }

  // The stats band has no id; find it by its heading instead.
  const stats = html.match(/<section[^>]*aria-labelledby="stats-h2"[\s\S]*?<\/section>/)?.[0] ?? '';
  const statsLede = ledeOf(stats);
  if (statsLede) out.stats = statsLede;

  return out;
}

/** The client and partner logo marquee. */
export function readBrandStrip(html: string): { label: string; slots: string[] } {
  const block = html.match(/<section[^>]*aria-label="Clients and partners"[\s\S]*?<\/section>/)?.[0] ?? '';
  return {
    label: stripTags(block.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    slots: [...block.matchAll(/<div class="lslot">([\s\S]*?)<\/div>/g)].map((m) => stripTags(m[1]!)),
  };
}

/** The numbered `.pro` cards. */
export function readProtect(html: string, icons: IconCollector) {
  const block = sectionByIdOrClass(html, 'protect');
  return [...block.matchAll(/<article class="pro[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => {
    const body = m[2] ?? '';
    return {
      accent: accentFromHex(m[1]?.trim()) as AccentToken,
      icon: icons.add(body.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? ''),
      title: stripTags(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
      description: stripTags(body.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    };
  });
}

/** The intro band's capability list and its image-frame labels. */
export function readIntro(html: string) {
  const block = sectionByIdOrClass(html, 'overview');
  return {
    capabilitiesTitle: stripTags(block.match(/<h3 class="core-h3[^"]*"[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
    capabilities: [...(block.match(/<ul class="core-ul[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)]
      .map((m) => stripTags(m[1]!))
      .filter(Boolean),
    mediaLabel: stripTags(block.match(/<span class="im-label">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    mediaHint: stripTags(block.match(/<span class="im-hint">([\s\S]*?)<\/span>/)?.[1] ?? ''),
  };
}

/** The market-context tiles. */
export function readMarketStats(html: string) {
  const block = sectionByIdOrClass(html, 'market');
  return [...block.matchAll(/<div class="mkt"><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span><\/div>/g)].map((m) => ({
    value: stripTags(m[1]!),
    label: stripTags(m[2]!),
  }));
}

/** The recognition band: the review panel and the award rows. */
export function readAwards(html: string, icons: IconCollector) {
  const block = sectionByIdOrClass(html, 'awards');
  const lead = block.match(/<div class="aw-lead[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[1] ?? block;

  return {
    lead: {
      title: stripTags(lead.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
      body: stripTags(lead.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
      rating: stripTags(block.match(/<div class="rating">[\s\S]*?<b>([\s\S]*?)<\/b>/)?.[1] ?? ''),
      ratingNote: stripTags(block.match(/<div class="rating">[\s\S]*?<b>[\s\S]*?<\/b>\s*<span>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    },
    items: [...block.matchAll(/<div class="aw[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => {
      const body = m[2] ?? '';
      return {
        accent: accentFromHex(m[1]?.trim()) as AccentToken,
        icon: icons.add(body.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? ''),
        title: stripTags(body.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? ''),
        meta: stripTags(body.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? ''),
      };
    }),
  };
}

/** The pricing band's table and the factor list beneath it. */
export function readCostTable(html: string) {
  const block = sectionByIdOrClass(html, 'cost');
  const table = block.match(/<table class="cost-table">([\s\S]*?)<\/table>/)?.[1] ?? '';

  const headers = [...(table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? '').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(
    (m) => stripTags(m[1]!),
  );

  const rows = [...(table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => {
    const row = m[1] ?? '';
    const tierMatch = row.match(/<span class="tier"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/span>/);
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[1]!));
    return {
      tier: stripTags(tierMatch?.[2] ?? ''),
      tierAccent: accentFromHex(tierMatch?.[1]?.trim()) as AccentToken,
      includes: cells[0] ?? '',
      timeline: cells[1] ?? '',
      investment: cells[2] ?? '',
    };
  });

  const factorsBlock = block.match(/<div class="cost-factors"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? '';

  return {
    caption: stripTags(table.match(/<caption[^>]*>([\s\S]*?)<\/caption>/)?.[1] ?? ''),
    headers,
    rows,
    factorsTitle: stripTags(factorsBlock.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
    factors: [...factorsBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => stripTags(m[1]!)).filter(Boolean),
  };
}

/** The reasons and office blocks beside the lead form. */
export function readLeadAside(html: string, icons: IconCollector) {
  const block = sectionByIdOrClass(html, 'contact');

  return {
    reasons: [...block.matchAll(/<div class="reason"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => {
      const body = m[2] ?? '';
      return {
        accent: accentFromHex(m[1]?.trim()) as AccentToken,
        icon: icons.add(body.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? ''),
        title: stripTags(body.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? ''),
        description: stripTags(body.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? ''),
      };
    }),
    offices: [...block.matchAll(/<div class="office"><p class="k">([\s\S]*?)<\/p><p>([\s\S]*?)<\/p><\/div>/g)].map((m) => ({
      label: stripTags(m[1]!),
      // <br> separates the address lines.
      lines: (m[2] ?? '')
        .split(/<br\s*\/?>/i)
        .map((line) => stripTags(line))
        .filter(Boolean),
    })),
  };
}

/** A CTA strip: its body copy, tick points and button. */
export function readCtaStrip(html: string, headingId: string) {
  const block =
    html.match(new RegExp(`<section[^>]*aria-labelledby="${headingId}"[\\s\\S]*?</section>`))?.[0] ?? '';

  const btn = block.match(/<a href="([^"]*)"[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/);

  return {
    body: stripTags(block.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    points: [...block.matchAll(/<div class="spoint">[\s\S]*?<span>([\s\S]*?)<\/span>\s*<\/div>/g)]
      .map((m) => stripTags(m[1]!))
      .filter(Boolean),
    button: btn ? { label: stripTags(btn[2] ?? ''), href: btn[1] ?? '#contact', style: 'mint' as const } : null,
    media: {
      label: stripTags(block.match(/<span class="im-label">([\s\S]*?)<\/span>/)?.[1] ?? ''),
      hint: stripTags(block.match(/<span class="im-hint">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    },
  };
}

/** The "why" band's CTA button label, and the note and button under the FAQ list. */
export function readWhyAndFaqExtras(html: string) {
  const why = sectionByIdOrClass(html, 'why');
  const faq = sectionByIdOrClass(html, 'faq');
  // The wrapper is `class="faq-after rv"`, so the class has to be matched as one of several.
  const faqAfter = faq.match(/<div class="[^"]*\bfaq-after\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';

  return {
    whyCtaLabel: stripTags(why.match(/<a[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''),
    faqAfter: stripTags(faqAfter.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    faqAfterCtaLabel: stripTags(faqAfter.match(/<a[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''),
  };
}

/** The button that closes a band, where the band has one. */
function readBandCta(block: string): string {
  const cta = block.match(/<div class="[^"]*\bcc-cta\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  return stripTags(cta.match(/<a[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '');
}

/** The button under the services panel. */
export function readServicesCta(html: string): string {
  return readBandCta(sectionByIdOrClass(html, 'services'));
}

/** The button under the solutions bento. */
export function readSolutionsCta(html: string): string {
  const block = sectionByIdOrClass(html, 'solutions');
  const cta = block.match(/<div class="[^"]*\bcc-cta\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  return stripTags(cta.match(/<a[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '');
}

/** The button that closes the "what moves the number" list under the cost table. */
export function readCostFactorsCta(html: string): string {
  const block = sectionByIdOrClass(html, 'cost');
  const factors = block.match(/<div class="cost-factors"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  return stripTags(factors.match(/<a[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '');
}

/**
 * The copy inside the carousel's faux terminal.
 *
 * The illustration itself is design and lives in the component, but the three variants of
 * this text are page-specific, so it is read from the page's own \`shotHTML\` helper rather
 * than being hard-coded into the renderer.
 */
export function readShotConsole(js: string): { command: string; checks: string[]; summary: string } {
  const code = js.match(/var code = '<div class="ui-code">([\s\S]*?)<\/div>';/)?.[1] ?? '';
  const parts = code.split(/<br>/).map((line) => stripTags(decodeEntities(line)).trim());

  const command = (parts[0] ?? '').replace(/^\$\s*/, '');
  const summary = (parts[parts.length - 1] ?? '').replace(/^[\u2192>]\s*/, '');
  const checks = parts.slice(1, -1).map((line) => line.replace(/^[\u2713\u2714]\s*/, ''));

  return { command, checks, summary };
}

export { decodeEntities };
