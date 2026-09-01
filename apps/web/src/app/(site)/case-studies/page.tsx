import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema, CollectionPageSchema } from '@/lib/seo/structuredData';
import { PageBlocks } from '@/components/sections/PageBlocks';
import { industryKey, isKnownIndustry, matchesIndustry } from '@/lib/industry';
import '@/styles/portfolio.css';

/**
 * Case studies — `/case-studies/`.
 *
 * The source file is named `aptentech-Portfolio.html`, but its canonical, `og:url` and
 * breadcrumb all declare `/case-studies/`. The canonical wins: routes are derived from the
 * URLs the source published, never from filenames.
 */
export const revalidate = 3600;

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The `?industry=` value, normalised, or null when absent or unrecognised. */
function industryFilter(params: Record<string, string | string[] | undefined>): string | null {
  const raw = params.industry;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;

  const key = industryKey(value);
  return isKnownIndustry(key) ? key : null;
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [page, settings, params] = await Promise.all([
    content.page('case-studies'),
    content.settings(),
    searchParams,
  ]);
  if (!page) return {};

  const base = buildMetadata({ seo: page.seo, settings, path: '/case-studies/', fallbackTitle: page.title });

  /*
    A filtered view is the same page showing fewer studies, so it must not compete with the
    index in search results. The canonical keeps pointing at the unfiltered URL and the view
    is left out of the index entirely — otherwise every menu industry would publish a thin
    near-duplicate of a page that already ranks.
  */
  if (!industryFilter(params)) return base;
  return { ...base, robots: { index: false, follow: true } };
}

export default async function CaseStudiesPage({ searchParams }: { searchParams: Search }) {
  const [page, settings, params] = await Promise.all([
    content.page('case-studies'),
    content.settings(),
    searchParams,
  ]);
  if (!page) notFound();

  /*
    Filtering narrows the studies this page already carries.

    It deliberately does not reach for the other case studies in the database. Those belong
    to individual service and solution pages — each page owns the work it cites — and the
    public listing exposes only the eight the index was designed around. Pulling the rest in
    would put work on this page that was never selected for it.

    The consequence is that only the industries those eight cover can be filtered, which is
    why the navigation offers `?industry=` for some entries and the plain index for others.
    A filter that matches nothing still falls back to the page as designed rather than an
    empty grid — as does an unrecognised industry, since a mistyped or retired filter should
    still show the work. Nothing about the layout changes either way: the same cards, in the
    same grid.
  */
  const key = industryFilter(params);
  const matches = key ? (page.caseStudies ?? []).filter((cs) => matchesIndustry(cs.industry, key)) : [];
  const visible = matches.length ? { ...page, caseStudies: matches } : page;

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
      <PageBlocks page={visible} settings={settings} />
    </>
  );
}
