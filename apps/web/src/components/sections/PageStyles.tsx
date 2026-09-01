import { PAGE_CSS } from '@/styles/pageExtras.generated';

/**
 * A page's own stylesheet tail.
 *
 * Most of the CSS is shared and imported as modules, but a handful of pages carry rules of
 * their own — the dating page recolours its buttons, ticks and labels throughout, three
 * pages adjust their hero, and the GEO page hides its pricing band. Merging those into the
 * shared solution stylesheet is what put the dating page's pink treatment on the other
 * eight solution pages, so each page's tail stays with the page.
 *
 * It is inlined the way the source carried it. The content is generated from the original
 * HTML at build time and never comes from the CMS, so there is no path from an editor to
 * this markup; the strings are checked into `pageExtras.generated.ts`.
 */
export function PageStyles({ slug }: { slug: string }) {
  const css = PAGE_CSS[slug];
  if (!css) return null;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
