import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema, FaqSchema, ServiceSchema } from '@/lib/seo/structuredData';
import { ServicePageView } from '@/components/sections/ServicePageView';
import { PageStyles } from '@/components/sections/PageStyles';
import '@/styles/site.css';

/**
 * Industry pages — `/industries/<slug>/`.
 *
 * Renders through `ServicePageView`, the same component the eight service pages use, so an
 * industry page is the approved design by construction rather than by resemblance. Only the
 * content differs.
 */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const industries = await content.industries();
  return industries.map((industry) => ({ slug: industry.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [page, settings] = await Promise.all([content.industry(slug), content.settings()]);
  if (!page) return {};

  return buildMetadata({
    seo: page.seo,
    settings,
    path: `/industries/${slug}/`,
    fallbackTitle: page.heroTitle,
    fallbackDescription: page.heroDescription,
    ogImage: page.heroImage,
  });
}

export default async function IndustryRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page, settings] = await Promise.all([content.industry(slug), content.settings()]);

  if (!page) notFound();

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: 'Industries', path: '/industries/' },
          { name: page.name, path: `/industries/${slug}/` },
        ]}
      />
      <ServiceSchema
        name={page.name}
        description={page.seo.description || page.heroDescription}
        path={`/industries/${slug}/`}
        settings={settings}
      />
      <FaqSchema faqs={page.faqs} />
      <PageStyles slug={slug} />
      <ServicePageView page={page} settings={settings} />
    </>
  );
}
