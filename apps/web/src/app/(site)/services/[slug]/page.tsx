import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema, FaqSchema, ServiceSchema } from '@/lib/seo/structuredData';
import { ServicePageView } from '@/components/sections/ServicePageView';
import { PageStyles } from '@/components/sections/PageStyles';
import '@/styles/site.css';

/**
 * Service pages — `/services/<slug>/`.
 *
 * One route serves all eight, statically generated at build and refreshed by ISR. The
 * slugs come from the CMS, and they are the same slugs the source declared in its
 * canonicals, so every indexed URL is preserved without a redirect.
 */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const services = await content.services();
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [page, settings] = await Promise.all([content.service(slug), content.settings()]);
  if (!page) return {};

  return buildMetadata({
    seo: page.seo,
    settings,
    path: `/services/${slug}/`,
    fallbackTitle: page.heroTitle,
    fallbackDescription: page.heroDescription,
    ogImage: page.heroImage,
  });
}

export default async function ServiceRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page, settings] = await Promise.all([content.service(slug), content.settings()]);

  if (!page) notFound();

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: 'Services', path: '/services/' },
          { name: page.name, path: `/services/${slug}/` },
        ]}
      />
      <ServiceSchema
        name={page.name}
        description={page.seo.description || page.heroDescription}
        path={`/services/${slug}/`}
        settings={settings}
      />
      <FaqSchema faqs={page.faqs} />
      <PageStyles slug={slug} />
      <ServicePageView page={page} settings={settings} />
    </>
  );
}
