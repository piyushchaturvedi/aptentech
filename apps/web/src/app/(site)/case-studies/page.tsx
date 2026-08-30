import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema, CollectionPageSchema } from '@/lib/seo/structuredData';
import { PageBlocks } from '@/components/sections/PageBlocks';
import '@/styles/portfolio.css';

/**
 * Case studies — `/case-studies/`.
 *
 * The source file is named `aptentech-Portfolio.html`, but its canonical, `og:url` and
 * breadcrumb all declare `/case-studies/`. The canonical wins: routes are derived from the
 * URLs the source published, never from filenames.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([content.page('case-studies'), content.settings()]);
  if (!page) return {};

  return buildMetadata({ seo: page.seo, settings, path: '/case-studies/', fallbackTitle: page.title });
}

export default async function CaseStudiesPage() {
  const [page, settings] = await Promise.all([content.page('case-studies'), content.settings()]);
  if (!page) notFound();

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: 'Case studies', path: '/case-studies/' },
        ]}
      />
      <CollectionPageSchema
        name={page.seo.title || page.title}
        description={page.seo.description}
        path="/case-studies/"
      />
      <PageBlocks page={page} settings={settings} />
    </>
  );
}
