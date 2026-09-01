import type { Metadata } from 'next';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema } from '@/lib/seo/structuredData';
import { IndexBand } from '@/components/sections/IndexBand';
import { ScrollReveal } from '@/components/sections/ScrollReveal';
import '@/styles/site.css';

/**
 * Solutions index — `/solutions/`.
 *
 * The breadcrumb on every solution page names "Solutions" as its parent and links here, so
 * the path was already promised to search engines as well as to readers. It lists the nine
 * solution pages, each described in its own words.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([content.page('solutions-index'), content.settings()]);
  return buildMetadata({
    seo: page?.seo,
    settings,
    path: '/solutions/',
    fallbackTitle: 'Solutions',
  });
}

export default async function SolutionsIndex() {
  const [solutions, page] = await Promise.all([content.solutions(), content.page('solutions-index')]);
  const band = (page?.blocks?.find((b) => b.type === 'pageIndex') ?? {}) as Record<string, string>;

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: band.crumbLabel || 'Solutions', path: '/solutions/' },
        ]}
      />

      <IndexBand
        crumbLabel={band.crumbLabel || 'Solutions'}
        eyebrow={band.eyebrow}
        title={band.title || 'Solutions'}
        lede={band.lede}
        items={solutions}
        prefix="/solutions/"
      />

      <ScrollReveal />
    </>
  );
}
