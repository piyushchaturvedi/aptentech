import type { Metadata } from 'next';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema, ItemListSchema } from '@/lib/seo/structuredData';
import { IndexBand } from '@/components/sections/IndexBand';
import { ScrollReveal } from '@/components/sections/ScrollReveal';
import '@/styles/site.css';

/**
 * Industries index — `/industries/`.
 *
 * The Industries menu is a group of eight entries, so it needs a page of its own for the
 * group heading to lead anywhere. It lists the industry pages, each described in its own
 * words, using the same card grid the services and solutions indexes use.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([content.page('industries-index'), content.settings()]);
  return buildMetadata({
    seo: page?.seo,
    settings,
    path: '/industries/',
    fallbackTitle: 'Industries',
  });
}

export default async function IndustriesIndex() {
  const [industries, page] = await Promise.all([content.industries(), content.page('industries-index')]);
  const band = (page?.blocks?.find((b) => b.type === 'pageIndex') ?? {}) as Record<string, string>;

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: band.crumbLabel || 'Industries', path: '/industries/' },
        ]}
      />

      <ItemListSchema
        items={industries.map((item) => ({ name: item.name, path: `/industries/${item.slug}/` }))}
        path="/industries/"
      />

      <IndexBand
        crumbLabel={band.crumbLabel || 'Industries'}
        eyebrow={band.eyebrow}
        title={band.title || 'Industries'}
        lede={band.lede}
        items={industries}
        prefix="/industries/"
      />

      <ScrollReveal />
    </>
  );
}
