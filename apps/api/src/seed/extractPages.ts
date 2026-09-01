/**
 * Readers for the home and about pages.
 *
 * Neither is an instance of a template: each is a one-off composition, and the generic
 * block extraction had matched most of their bands to "prose", losing the statistics panel,
 * the values and principles grids, the client marquee, the recognition band and the office
 * cards among others. Every reader below is written against the page's own markup.
 */
import { accentFromHex, type AccentToken } from '@aptentech/shared';
import { IconCollector, decodeEntities, stripTags } from './extract';
import { sectionByIdOrClass } from './extractSections';
import { readInsightCards } from './extractPageContent';

function svg(html: string, icons: IconCollector): string {
  return icons.add(html.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? '');
}

/** A section's `.sect-head`, which on these pages nests the eyebrow and heading in a div. */
function head(block: string) {
  return {
    eyebrow: stripTags(block.match(/<span class="eyebrow[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    title: stripTags(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    lede: stripTags(block.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
  };
}

/**
 * Splits a heading around its `<span class="g">` highlight.
 *
 * Both heroes gradient-fill part of the headline. Keeping the three parts separate means an
 * editor changes wording without touching markup, and the highlight cannot be lost.
 */
function splitHeading(html: string): { lead: string; highlight: string; trail: string } {
  const match = html.match(/^([\s\S]*?)<span class="g">([\s\S]*?)<\/span>([\s\S]*)$/);
  if (!match) return { lead: stripTags(html), highlight: '', trail: '' };

  // The parts are stored trimmed; the renderer puts the separating space back. Keeping it
  // here would not survive the schema's trimming, and without it the last word of the lead
  // joins the first of the highlight into one unbreakable string and the heading gains a
  // line — which is exactly how it showed up in the layout comparison.
  return {
    lead: stripTags(match[1] ?? ''),
    highlight: stripTags(match[2] ?? ''),
    trail: stripTags(match[3] ?? ''),
  };
}

/** Buttons in a hero's call-to-action row, with their style taken from the button class. */
function ctas(block: string) {
  return [...block.matchAll(/<a href="([^"]*)"[^>]*class="btn ([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
    const classes = m[2] ?? '';
    const style = classes.includes('mint')
      ? ('mint' as const)
      : classes.includes('ghost-light')
        ? ('ghostLight' as const)
        : classes.includes('glass')
          ? ('glass' as const)
          : ('primary' as const);
    return { label: stripTags(m[3] ?? ''), href: m[1] ?? '#', style };
  });
}

/** The counters inside a `.stats` panel. */
function stats(block: string) {
  return [...block.matchAll(
    /<div class="num" data-count="([^"]*)" data-suffix="([^"]*)">[\s\S]*?<\/div>\s*<div class="lab">([\s\S]*?)<\/div>/g,
  )].map((m) => ({ value: m[1] ?? '', suffix: m[2] ?? '', label: stripTags(m[3] ?? '') }));
}

/** Icon cards: `.hq`, `.val`, `.why` and the AI grid all share this shape. */
function iconCards(block: string, selector: string, icons: IconCollector) {
  // The opening tag is captured and matched again on the way out. Accepting either tag on
  // the closing side ended the match at the icon's own `</div>`, before the heading, which
  // is what left every value and why card without a title or body.
  const pattern = new RegExp(
    `<(article|div) class="${selector}[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\\s\\S]*?)<\\/\\1>`,
    'g',
  );

  return [...block.matchAll(pattern)].map((m) => {
    const body = m[3] ?? '';
    // `.hq` puts its copy in `<b>`/`<span>`; the grids use a heading and a paragraph.
    const title = stripTags(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? body.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? '');
    const description = stripTags(
      body.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? body.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? '',
    );
    return { accent: accentFromHex(m[2]?.trim()) as AccentToken, icon: svg(body, icons), title, description };
  });
}

/* ------------------------------------------------------------------ about page */

export function readAboutHero(html: string, icons: IconCollector) {
  const block = html.match(/<section class="hero-about[^"]*"[\s\S]*?<\/section>/)?.[0] ?? '';
  // The card list runs to the end of the hero and each card nests divs of its own, so it is
  // taken by position rather than by a non-greedy match that stops at the first nested tag.
  const quickStart = block.indexOf('<div class="ha-quick');
  const quick = quickStart < 0 ? block : block.slice(quickStart);

  return {
    crumbLabel: stripTags(block.match(/<span aria-current="page">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    eyebrow: stripTags(block.match(/<span class="eyebrow[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    splitHeading: splitHeading(block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''),
    lede: stripTags(block.match(/<p class="ha-lede[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    ctas: ctas(block.match(/<div class="ha-cta[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? ''),
    quickCards: iconCards(quick, 'hq', icons),
  };
}

/** The counters panel. On the home page it also carries the client marquee. */
export function readStatsPanel(html: string) {
  const block =
    html.match(/<section class="results-sec"[\s\S]*?<\/section>/)?.[0] ??
    html.match(/<section[^>]*aria-labelledby="stats-h2"[\s\S]*?<\/section>/)?.[0] ??
    '';
  // Same again: the marquee nests several levels, so the block is taken to the end.
  const trustedStart = block.indexOf('<div class="trusted">');
  const trusted = trustedStart < 0 ? '' : block.slice(trustedStart);

  return {
    title: stripTags(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    note: stripTags(block.match(/<p class="ks">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    stats: stats(block),
    trustedLabel: stripTags(trusted.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    logoSlots: [...trusted.matchAll(/<div class="lslot">([\s\S]*?)<\/div>/g)].map((m) => stripTags(m[1]!)),
  };
}

/** The about page's "who we are" band: copy, capability list and the image slot. */
export function readStoryBand(html: string) {
  const block = sectionByIdOrClass(html, 'story');
  return {
    title: stripTags(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    lede: stripTags(block.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    capabilitiesTitle: stripTags(block.match(/<h3 class="core-h3[^"]*"[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
    capabilities: [...(block.match(/<ul class="core-ul[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '').matchAll(
      /<li>([\s\S]*?)<\/li>/g,
    )].map((m) => stripTags(m[1]!)),
    mediaLabel: stripTags(block.match(/<span class="im-label">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    mediaHint: stripTags(block.match(/<span class="im-hint">([\s\S]*?)<\/span>/)?.[1] ?? ''),
  };
}

export function readValueGrid(html: string, icons: IconCollector) {
  const block = sectionByIdOrClass(html, 'values');
  return { ...head(block), values: iconCards(block, 'val', icons) };
}

/** The numbered principles in "how an engagement actually runs". */
export function readPrincipleList(html: string) {
  const block = sectionByIdOrClass(html, 'how');
  return {
    ...head(block),
    principles: [...block.matchAll(/<article style="--c:([^"]*)">([\s\S]*?)<\/article>/g)].map((m) => {
      const body = m[2] ?? '';
      return {
        accent: accentFromHex(m[1]?.trim()) as AccentToken,
        number: stripTags(body.match(/<span class="n">([\s\S]*?)<\/span>/)?.[1] ?? ''),
        title: stripTags(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
        description: stripTags(body.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
      };
    }),
  };
}

/** The standalone client and partner marquee. */
export function readBrandStripBand(html: string) {
  const block = html.match(/<section[^>]*aria-label="Clients and partners"[\s\S]*?<\/section>/)?.[0] ?? '';
  return {
    label: stripTags(block.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    logoSlots: [...block.matchAll(/<div class="lslot">([\s\S]*?)<\/div>/g)].map((m) => stripTags(m[1]!)),
  };
}

/* ------------------------------------------------------------------ home page */

export function readHomeHero(html: string) {
  const block = html.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0] ?? '';
  const pill = block.match(/<span class="pill[^"]*">([\s\S]*?)<\/span>\s*<\/span>|<span class="pill[^"]*">([\s\S]*?)<\/span>/);
  const pillHtml = block.match(/<span class="pill[^"]*">([\s\S]*?)<h1/s)?.[1] ?? pill?.[1] ?? '';

  return {
    pillText: stripTags(pillHtml.replace(/<b>[\s\S]*?<\/b>/, '')),
    pillStrong: stripTags(pillHtml.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? ''),
    splitHeading: splitHeading(block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''),
    sub: stripTags(block.match(/<p class="hero-sub[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    ctas: ctas(block.match(/<div class="hero-cta[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? ''),
    note: stripTags(block.match(/<p class="hero-note[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''),
  };
}

export function readWhyGrid(html: string, icons: IconCollector) {
  const block = sectionByIdOrClass(html, 'why');
  return { ...head(block), items: iconCards(block, 'why', icons) };
}

/** The head of a band identified by its DOM id, for bands whose items come from elsewhere. */
export function readBandHead(html: string, id: string) {
  return head(sectionByIdOrClass(html, id));
}

/** The case carousel band: its head and the button beneath it. */
export function readCaseBand(html: string) {
  const block = sectionByIdOrClass(html, 'work');
  const cta = block.match(/<div class="cc-cta[^"]*">\s*<a href="([^"]*)"[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/);
  return {
    ...head(block),
    ctaLabel: stripTags(cta?.[2] ?? ''),
    ctaHref: cta?.[1] ?? '',
  };
}

/** The FAQ band: its head plus the "still have a question" card beside the list. */
export function readFaqShell(html: string) {
  const block = sectionByIdOrClass(html, 'faq');
  const ask = block.match(/<div class="faq-ask">([\s\S]*?)<\/div>/)?.[1] ?? '';
  return {
    ...head(block),
    askTitle: stripTags(ask.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
    askBody: stripTags(ask.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    askCtaLabel: stripTags(ask.match(/<a[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''),
  };
}

/** The dark "latest from the blog" band, including its "view all" button. */
export function readLatestInsights(html: string) {
  const block = sectionByIdOrClass(html, 'blog');
  return {
    eyebrow: stripTags(block.match(/<span class="eyebrow[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    title: stripTags(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    lede: stripTags(block.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    buttonLabel: stripTags(block.match(/<a[^>]*class="blog-btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''),
    /*
      The tag above each card and its accent are the page's presentation of the article, not
      the article's own category: the about page labels "How much does custom software
      development cost?" as a Guide where the software page calls the same piece a Cost
      guide. The article supplies the title, standfirst and link; this supplies how that page
      shows it.
    */
    insightCards: readInsightCards(html).map((card) => ({
      slug: card.slug,
      label: card.categoryName,
      accent: card.accent,
    })),
  };
}

/** A `.strip` call-to-action band, addressed by the id on its heading. */
export function readStripBand(html: string, headingId: string) {
  // The id travels with the band: the source calls these `car-h2` and `strip-h2`, and the
  // section's `aria-labelledby` has to keep pointing at the heading it names.
  const block = html.match(new RegExp(`<section[^>]*aria-labelledby="${headingId}"[\\s\\S]*?</section>`))?.[0] ?? '';
  const cta = block.match(/<a href="([^"]*)"[^>]*class="btn ([^"]*)"[^>]*>([\s\S]*?)<\/a>/);

  return {
    headingId,
    // Two of these bands set their own vertical padding inline; without it the band is
    // noticeably taller than the original.
    paddingBlock: block.match(/<section[^>]*style="padding-block:([^"]*)"/)?.[1] ?? '',
    eyebrow: stripTags(block.match(/<span class="eyebrow[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    title: stripTags(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    body: stripTags(block.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    ctas: cta
      ? [
          {
            label: stripTags(cta[3] ?? ''),
            href: cta[1] ?? '#',
            style: (cta[2] ?? '').includes('mint') ? ('mint' as const) : ('primary' as const),
          },
        ]
      : [],
    points: [...block.matchAll(/<div class="spoint">[\s\S]*?<span>([\s\S]*?)<\/span>\s*<\/div>/g)]
      .map((m) => stripTags(m[1]!))
      .filter(Boolean),
  };
}

export { decodeEntities };
