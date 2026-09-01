/**
 * Reads the contact page as the four bands it actually is.
 *
 * The generic block extraction had matched its opening band to the standard hero and its
 * middle two bands to prose, which dropped the numbered "what happens next" cards, the
 * four contact routes and the office cards entirely. Each reader below is written against
 * the page's own markup so the migration renders those bands rather than approximating
 * them, and every string ends up editable in the CMS.
 */
import { accentFromHex, type AccentToken } from '@aptentech/shared';
import { IconCollector, stripTags } from './extract';
import { sectionByIdOrClass } from './extractSections';

function iconOf(html: string, icons: IconCollector): string {
  return icons.add(html.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? '');
}

function headOf(block: string) {
  return {
    title: stripTags(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    lede: stripTags(block.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
  };
}

/** The opening lead banner: heading, reasons to write, office summary and the form head. */
export function readContactBanner(html: string, icons: IconCollector) {
  const block = sectionByIdOrClass(html, 'contact');
  const copy = block.match(/<div class="lead-copy">([\s\S]*?)<div class="form-card/)?.[1] ?? block;

  return {
    crumbLabel: stripTags(block.match(/<span aria-current="page">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    heading: stripTags(copy.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''),
    lede: stripTags(copy.match(/<p[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    reasons: [...copy.matchAll(/<div class="reason"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => {
      const body = m[2] ?? '';
      return {
        accent: accentFromHex(m[1]?.trim()) as AccentToken,
        icon: iconOf(body, icons),
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
    formTitle: stripTags(block.match(/<div class="form-head[^"]*">\s*<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    formSubtitle: stripTags(block.match(/<p class="form-sub">([\s\S]*?)<\/p>/)?.[1] ?? ''),
  };
}

/** The numbered "what happens after you hit send" cards. */
export function readStepGrid(html: string) {
  const block = sectionByIdOrClass(html, 'next');
  return {
    ...headOf(block),
    stepCards: [...block.matchAll(/<article class="next[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/article>/g)].map(
      (m) => {
        const body = m[2] ?? '';
        return {
          accent: accentFromHex(m[1]?.trim()) as AccentToken,
          number: stripTags(body.match(/<span class="n">([\s\S]*?)<\/span>/)?.[1] ?? ''),
          title: stripTags(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
          description: stripTags(body.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
        };
      },
    ),
  };
}

/** The four routes to a person. Each keeps the source's placeholder address verbatim. */
export function readRouteGrid(html: string, icons: IconCollector) {
  const block = sectionByIdOrClass(html, 'routes');
  return {
    ...headOf(block),
    routes: [...block.matchAll(/<article class="route[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/article>/g)].map(
      (m) => {
        const body = m[2] ?? '';
        const link = body.match(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
        return {
          accent: accentFromHex(m[1]?.trim()) as AccentToken,
          icon: iconOf(body, icons),
          title: stripTags(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
          description: stripTags(body.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
          linkLabel: stripTags(link?.[2] ?? ''),
          href: link?.[1] ?? '',
        };
      },
    ),
  };
}

/** The office cards. Addresses are the source's placeholders; nothing is invented. */
export function readOfficeCards(html: string) {
  const block = sectionByIdOrClass(html, 'offices');
  return {
    ...headOf(block),
    cards: [...block.matchAll(/<article class="off[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => {
      const body = m[2] ?? '';
      const link = body.match(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      return {
        accent: accentFromHex(m[1]?.trim()) as AccentToken,
        kind: stripTags(body.match(/<span class="k">([\s\S]*?)<\/span>/)?.[1] ?? ''),
        city: stripTags(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
        addressLines: (body.match(/<address>([\s\S]*?)<\/address>/)?.[1] ?? '')
          .split(/<br\s*\/?>/i)
          .map((line) => stripTags(line))
          .filter(Boolean),
        phoneLabel: stripTags(link?.[2] ?? ''),
        phoneHref: link?.[1] ?? '',
      };
    }),
  };
}
