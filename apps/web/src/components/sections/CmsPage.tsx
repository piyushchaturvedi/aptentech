import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema, FaqSchema } from '@/lib/seo/structuredData';
import { PageBlocks } from './PageBlocks';

/**
 * Shared plumbing for the CMS-driven static pages.
 *
 * Home, About, Contact and the two legal pages differ only in slug, breadcrumb label and
 * which stylesheet they load, so the fetch/metadata/render sequence lives here once and
 * each route stays a few lines. Keeping it shared also means a change to how metadata or
 * structured data is derived applies to all of them at once.
 */

export async function cmsPageMetadata(slug: string, path: string): Promise<Metadata> {
  const [page, settings] = await Promise.all([content.page(slug), content.settings()]);
  if (!page) return {};

  return buildMetadata({
    seo: page.seo,
    settings,
    path,
    fallbackTitle: page.title,
  });
}

export async function CmsPage({
  slug,
  path,
  breadcrumb,
}: {
  slug: string;
  path: string;
  breadcrumb?: string;
}) {
  const [page, settings] = await Promise.all([content.page(slug), content.settings()]);
  if (!page) notFound();

  // Only FAQs that are actually rendered are described in the schema.
  const faqBlock = page.blocks?.find((b) => b.type === 'faqSection' && b.enabled !== false) as
    | { faqs?: Parameters<typeof FaqSchema>[0]['faqs']; emitSchema?: boolean }
    | undefined;

  return (
    <>
      {breadcrumb ? (
        <BreadcrumbSchema
          trail={[
            { name: 'Home', path: '/' },
            { name: breadcrumb, path },
          ]}
        />
      ) : null}
      {faqBlock?.faqs?.length && faqBlock.emitSchema !== false ? <FaqSchema faqs={faqBlock.faqs} /> : null}
      {/*
        A per-page scope hook.

        `.pg` is `display:contents`, so the element itself produces no box and the sections
        lay out exactly as they did before — it exists only so a stylesheet can say
        `.pg-home .sect-head` and reach one page's section headings without touching the
        other seven templates. Scoping this way rather than writing an unqualified rule in
        home.css matters because route stylesheets are not reliably detached on client-side
        navigation, so an unscoped rule can follow the visitor to the next page.
      */}
      <div className={`pg pg-${slug}`}>
        <PageBlocks page={page} settings={settings} />
      </div>
    </>
  );
}
