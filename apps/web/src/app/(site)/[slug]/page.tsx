import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema } from '@/lib/seo/structuredData';
import { PageBlocks } from '@/components/sections/PageBlocks';
import { ScrollReveal } from '@/components/sections/ScrollReveal';
import '@/styles/site.css';

/**
 * Pages created in the CMS — `/<slug>/`.
 *
 * A catch-all at the root of the public site, so an editor can add a page at any address
 * without a developer adding a route. Next resolves a static segment before a dynamic one,
 * so `/about/`, `/services/` and the rest keep their own routes; only an address nothing
 * else claims reaches this file, and the API refuses to create a page on any of them.
 *
 * The page renders through `PageBlocks` — the same component the seven core pages use — so a
 * new page is built from the approved sections rather than from free-form markup. An editor
 * chooses which sections appear and what they say; they cannot introduce a section the design
 * has no rules for.
 */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const pages = await content.pages();
  // The core pages have their own routes and would otherwise be prerendered twice.
  return pages.filter((page) => page.custom).map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [page, settings] = await Promise.all([content.page(slug), content.settings()]);
  if (!page) return {};

  return buildMetadata({
    seo: page.seo,
    settings,
    path: `/${slug}/`,
    fallbackTitle: page.title,
  });
}

export default async function CustomPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page, settings] = await Promise.all([content.page(slug), content.settings()]);

  if (!page) notFound();

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: page.title, path: `/${slug}/` },
        ]}
      />

      <PageBlocks page={page} settings={settings} />

      <ScrollReveal />
    </>
  );
}
