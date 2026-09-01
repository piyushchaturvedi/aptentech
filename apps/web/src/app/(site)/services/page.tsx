import type { Metadata } from 'next';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema } from '@/lib/seo/structuredData';
import { IndexBand } from '@/components/sections/IndexBand';
import { ScrollReveal } from '@/components/sections/ScrollReveal';
import '@/styles/site.css';

/**
 * Services index — `/services/`.
 *
 * The source's mega-menu pointed 864 links here and no page existed, so the first migration
 * pass redirected it into the homepage's services band. That resolved without a 404 but read
 * as broken: clicking any of the eighteen entries under "Services" left you where you were.
 *
 * The page lists the eight service pages that do exist, each described in its own words. Its
 * heading and standfirst come from the CMS, seeded with the homepage's own copy for this
 * band — which says exactly what the page is for.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([content.page('services-index'), content.settings()]);
  return buildMetadata({
    seo: page?.seo,
    settings,
    path: '/services/',
    fallbackTitle: 'Services',
  });
}

export default async function ServicesIndex() {
  const [services, page] = await Promise.all([content.services(), content.page('services-index')]);
  const band = (page?.blocks?.find((b) => b.type === 'pageIndex') ?? {}) as Record<string, string>;

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: band.crumbLabel || 'Services', path: '/services/' },
        ]}
      />

      <IndexBand
        crumbLabel={band.crumbLabel || 'Services'}
        eyebrow={band.eyebrow}
        title={band.title || 'Services'}
        lede={band.lede}
        items={services}
        prefix="/services/"
      />

      <ScrollReveal />
    </>
  );
}
