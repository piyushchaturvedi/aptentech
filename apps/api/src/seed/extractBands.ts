/**
 * Readers for the bands the CMS pages share.
 *
 * The home, about and case-study pages close with the same lead band — heading, reasons to
 * write, office summary and the form — and the case-study page opens with its own hero and
 * study list. The generic block extraction had reduced all of these to a hero plus prose,
 * so each is read here from the source's own markup instead.
 */
import { accentFromHex, type AccentToken } from '@aptentech/shared';
import { IconCollector, stripTags } from './extract';
import { sectionByIdOrClass } from './extractSections';

/**
 * The closing lead band.
 *
 * Its shape is the same on all three pages; the home page adds an eyebrow above the
 * heading, which shifts every reveal delay below it by one step.
 */
export function readLeadBand(html: string, icons: IconCollector) {
  const block = sectionByIdOrClass(html, 'contact');
  const copy = block.match(/<div class="lead-copy">([\s\S]*?)<div class="form-card/)?.[1] ?? block;

  return {
    eyebrow: stripTags(copy.match(/<span class="eyebrow[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    title: stripTags(copy.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    lede: stripTags(copy.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    reasons: [...copy.matchAll(/<div class="reason"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => {
      const body = m[2] ?? '';
      return {
        accent: accentFromHex(m[1]?.trim()) as AccentToken,
        icon: icons.add(body.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? ''),
        title: stripTags(body.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? ''),
        description: stripTags(body.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? ''),
      };
    }),
    offices: [...copy.matchAll(/<div class="office"><p class="k">([\s\S]*?)<\/p><p>([\s\S]*?)<\/p><\/div>/g)].map((m) => ({
      label: stripTags(m[1]!),
      lines: (m[2] ?? '')
        .split(/<br\s*\/?>/i)
        .map((line) => stripTags(line))
        .filter(Boolean),
    })),
    // The case-study page heads its form with an `h2.h2-sm`; the home and about pages use
    // a plain `h3`. Both are in the design, so the tag travels with the content.
    formTitle: stripTags(block.match(/<div class="form-head[^"]*">\s*<h[23][^>]*>([\s\S]*?)<\/h[23]>/)?.[1] ?? ''),
    formTitleTag: /<div class="form-head[^"]*">\s*<h3/.test(block) ? ('h3' as const) : ('h2' as const),
    // The case-study page adds a reply-time note beside that heading. It carries no class,
    // so the structural comparison could not see it — the layout one caught it as a
    // form-head half the height it should be.
    formNote: stripTags(block.match(/<div class="form-head[^"]*">[\s\S]*?<span>([\s\S]*?)<\/span>/)?.[1] ?? ''),
  };
}

/** The case-study page's hero: eyebrow, heading, standfirst and three headline figures. */
export function readPortfolioHero(html: string) {
  const block = html.match(/<section class="pf-hero"[\s\S]*?<\/section>/)?.[0] ?? '';

  return {
    crumbLabel: stripTags(block.match(/<span aria-current="page">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    eyebrow: stripTags(block.match(/<span class="eyebrow[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    title: stripTags(block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''),
    lede: stripTags(block.match(/<p class="pf-lede[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    stats: [...(block.match(/<div class="pf-stats[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '').matchAll(
      /<span><b>([\s\S]*?)<\/b>([\s\S]*?)<\/span>/g,
    )].map((m) => ({ value: stripTags(m[1]!), suffix: '', label: stripTags(m[2]!) })),
  };
}

/** The blog listing's hero and the labels around its two-column shell. */
export function readBlogHero(html: string) {
  const hero = html.match(/<section class="blog-hero"[\s\S]*?<\/section>/)?.[0] ?? '';
  const side = html.match(/<aside class="blog-side">([\s\S]*?)<\/aside>/)?.[1] ?? '';

  return {
    crumbLabel: stripTags(hero.match(/<span aria-current="page">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    eyebrow: stripTags(hero.match(/<span class="eyebrow[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    title: stripTags(hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''),
    kicker: stripTags(hero.match(/<p class="bh-kicker[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    listHeading: stripTags(html.match(/<h2 class="sr-only" id="list-h2">([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    sidebarTitle: stripTags(side.match(/<h2 class="hf-title">([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    sidebarSubtitle: stripTags(side.match(/<p class="hf-sub">([\s\S]*?)<\/p>/)?.[1] ?? ''),
  };
}

/** The fixed wording around an article, read from the blog detail template. */
export function readArticleTemplate(html: string) {
  const side = html.match(/<aside class="post-side">([\s\S]*?)<\/aside>/)?.[1] ?? '';
  const related = html.match(/<section[^>]*id="related"[\s\S]*?<\/section>/)?.[0] ?? '';
  const pn = html.match(/<nav class="pn"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const crumb = html.match(/<nav class="crumb"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const captions = [...pn.matchAll(/<span class="k">([\s\S]*?)<\/span>/g)].map((m) => stripTags(m[1]!));

  return {
    // The breadcrumb's middle step: the label the blog index is referred to by.
    crumbLabel: stripTags([...crumb.matchAll(/<a href="\/blog\/">([\s\S]*?)<\/a>/g)][0]?.[1] ?? ''),
    tocLabel: stripTags(html.match(/<nav class="post-toc"[\s\S]*?<p class="k">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    shareLabel: stripTags(html.match(/<div class="share">\s*<span class="k">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    authorLabel: stripTags(html.match(/<div class="author-box">[\s\S]*?<p class="k">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    prevLabel: captions[0] ?? '',
    nextLabel: captions[1] ?? '',
    sidebarTitle: stripTags(side.match(/<h2 class="hf-title">([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    sidebarSubtitle: stripTags(side.match(/<p class="hf-sub">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    relatedTitle: stripTags(related.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    relatedLede: stripTags(related.match(/<p class="lede[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    defaultBody: readTemplateBody(html),
  };
}

/**
 * The example article inside the template's `.article` container.
 *
 * The trailing furniture — tags, share, author box, previous/next — is chrome the route
 * renders itself, so it is cut off here and only the article proper is kept.
 */
function readTemplateBody(html: string): string {
  const start = html.indexOf('<div class="article" id="article">');
  if (start < 0) return '';

  const body = html.slice(start + '<div class="article" id="article">'.length);
  const end = body.indexOf('<div class="post-foot">');
  return (end < 0 ? body : body.slice(0, end)).trim();
}

/** The case-study list band: its screen-reader heading and the button beneath the list. */
export function readPortfolioList(html: string) {
  const block = html.match(/<h2 class="sr-only" id="work-h2">[\s\S]*?<\/section>/)?.[0] ?? '';
  const cta = block.match(/<div class="pf-cta[^"]*">\s*<a href="([^"]*)"[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/);

  return {
    title: stripTags(block.match(/<h2 class="sr-only"[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    ctaLabel: stripTags(cta?.[2] ?? ''),
    ctaHref: cta?.[1] ?? '',
  };
}
