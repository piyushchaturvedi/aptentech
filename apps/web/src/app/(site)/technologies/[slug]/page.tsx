import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema, FaqSchema, ServiceSchema } from '@/lib/seo/structuredData';
import { ServicePageView } from '@/components/sections/ServicePageView';
import { PageStyles } from '@/components/sections/PageStyles';
import '@/styles/site.css';

/**
 * Technology pages — `/technologies/<slug>/`.
 *
 * Renders through `ServicePageView`, the same component the eight service pages use, so a
 * technology page is the approved design by construction rather than by resemblance. Only
 * the content differs.
 */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const technologies = await content.technologyPages();
  return technologies.map((technology) => ({ slug: technology.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [page, settings] = await Promise.all([content.technology(slug), content.settings()]);
  if (!page) return {};

  return buildMetadata({
    seo: page.seo,
    settings,
    path: `/technologies/${slug}/`,
    fallbackTitle: page.heroTitle,
    fallbackDescription: page.heroDescription,
    ogImage: page.heroImage,
  });
}

export default async function TechnologyRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page, settings] = await Promise.all([content.technology(slug), content.settings()]);

  if (!page) notFound();

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: 'Technologies', path: '/technologies/' },
          { name: page.name, path: `/technologies/${slug}/` },
        ]}
      />
      <ServiceSchema
        name={page.name}
        description={page.seo.description || page.heroDescription}
        path={`/technologies/${slug}/`}
        settings={settings}
      />
      <FaqSchema faqs={page.faqs} />
      <PageStyles slug={slug} />
      <ServicePageView page={page} settings={settings} />
    </>
  );
}
