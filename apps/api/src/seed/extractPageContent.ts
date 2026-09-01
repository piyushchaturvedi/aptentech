/**
 * Reads the content each service and solution page carries for itself.
 *
 * Three collections looked shared and were not. Every one of the seventeen pages ships its
 * own testimonials, its own "latest insights" cards and its own case studies, written for
 * that subject — the taxi page's quotes talk about driver onboarding and matching, the
 * fitness page's about coaching. Attaching one shared set to all of them dropped roughly
 * fifty testimonials and fifty articles and put the wrong copy on sixteen pages.
 */
import { accentFromHex, type AccentToken } from '@aptentech/shared';
import { stripTags } from './extract';
import { sectionByIdOrClass } from './extractSections';

/** The three cards in a page's "latest from the blog" band. */
export function readInsightCards(html: string) {
  const block = sectionByIdOrClass(html, 'blog');

  return [...block.matchAll(/<article class="blog-card[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/article>/g)].map(
    (m) => {
      const body = m[2] ?? '';
      const href = body.match(/<a href="([^"]*)"[^>]*class="blog-more"/)?.[1] ?? '';
      return {
        accent: accentFromHex(m[1]?.trim()) as AccentToken,
        categoryName: stripTags(body.match(/<span class="tag">([\s\S]*?)<\/span>/)?.[1] ?? ''),
        title: stripTags(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
        excerpt: stripTags(body.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ''),
        href,
        slug: href.replace(/\/$/, '').split('/').pop() ?? '',
      };
    },
  );
}

/** The quotes in a page's testimonial band, with the industry and duration chips. */
export function readPageTestimonials(html: string) {
  const block = sectionByIdOrClass(html, 'testimonials');

  return [...block.matchAll(/<figure class="tstc[^"]*"[^>]*style="--c:([^"]*)"[^>]*>([\s\S]*?)<\/figure>/g)].map((m) => {
    const body = m[2] ?? '';
    const role = stripTags(body.match(/<em>([\s\S]*?)<\/em>/)?.[1] ?? '');
    const [designation = '', company = ''] = role.split(',').map((part) => part.trim());
    const meta = [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((s) => stripTags(s[1] ?? ''));

    return {
      accent: accentFromHex(m[1]?.trim()) as AccentToken,
      content: stripTags(body.match(/<blockquote>([\s\S]*?)<\/blockquote>/)?.[1] ?? '').replace(/^"|"$/g, ''),
      name: stripTags(body.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? ''),
      designation,
      company,
      industry: meta.find((x) => x.startsWith('Industry:'))?.replace('Industry:', '').trim() ?? '',
      duration: meta.find((x) => x.startsWith('Duration:'))?.replace('Duration:', '').trim() ?? '',
      // The number of stars drawn is the rating the page shows.
      rating: (body.match(/<svg[^>]*viewBox="0 0 20 20"/g) ?? []).length || null,
    };
  });
}
