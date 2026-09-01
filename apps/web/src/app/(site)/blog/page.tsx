import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCENT_HEX } from '@aptentech/shared';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema } from '@/lib/seo/structuredData';
import { Media } from '@/components/shared/Media';
import { ScrollReveal } from '@/components/sections/ScrollReveal';
import { HeroForm } from '@/components/forms/HeroForm';
import '@/styles/blog.css';

/**
 * Blog listing — `/blog/`.
 *
 * `/blog/` is the canonical path: the blog page's own canonical, its breadcrumb and every
 * in-body article link use it. The footer on 24 of 25 source pages linked to `/insights/`
 * instead, which is a path with no page behind it — that now 301s here (see next.config).
 *
 * The markup is the source's: a hero carrying the featured guide, then a two-column shell
 * with the article grid beside the enquiry form. The source built the grid from a
 * page-local JavaScript array and hard-coded eight pages of pagination; both come from the
 * CMS here, so the pager reflects the articles that actually exist.
 *
 * Articles change more often than service pages, so this revalidates on a shorter interval
 * as well as on publish.
 */
export const revalidate = 900;

/** Matches the source's `19 Aug 2026`. */
function formatDate(iso: string | null): { datetime: string; label: string } {
  if (!iso) return { datetime: '', label: '' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { datetime: '', label: '' };
  return {
    datetime: date.toISOString().slice(0, 10),
    label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

/** The source shows a two-letter monogram where an author photo will go. */
function monogram(name: string): string {
  const initials = name
    .replace(/[[\]]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');
  return initials.toUpperCase() || '[AV]';
}

export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([content.page('blog'), content.settings()]);
  return buildMetadata({
    seo: page?.seo,
    settings,
    path: '/blog/',
    fallbackTitle: 'Insights & Engineering Blog',
  });
}

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; tag?: string }>;
}) {
  const params = await searchParams;
  const pageNumber = Math.max(1, Number(params.page ?? '1') || 1);

  // Eleven per page: the source's first screen is one featured guide above a grid of ten.
  const [posts, cmsPage] = await Promise.all([
    content.blog(pageNumber, 11, { category: params.category, tag: params.tag }),
    content.page('blog'),
  ]);

  const hero = (cmsPage?.blocks?.find((b) => b.type === 'blogHero') ?? {}) as Record<string, string>;
  const [featured, ...rest] = posts.items;
  const featuredDate = formatDate(featured?.publishedAt ?? null);

  const href = (n: number) => (n === 1 ? '/blog/' : `/blog/?page=${n}`);
  /*
    The number strip: the first three pages, then an ellipsis and the last, which is the
    shape the source drew. With four pages or fewer every page is listed and no ellipsis
    appears, because none is needed.
  */
  const total = posts.totalPages;
  const pages = total <= 4 ? Array.from({ length: total }, (_, i) => i + 1) : [1, 2, 3];
  const gap = total > 4;

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: hero.crumbLabel || 'Insights', path: '/blog/' },
        ]}
      />

      <section className="blog-hero" aria-labelledby="page-h1">
        <div className="wrap">
          <nav className="crumb" aria-label="Breadcrumb" style={{ marginBottom: 14 }}>
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li>
                <span aria-current="page">{hero.crumbLabel}</span>
              </li>
            </ol>
          </nav>

          <div className="bh-top">
            {hero.eyebrow ? <span className="eyebrow rv">{hero.eyebrow}</span> : null}
            <h1 className="rv d1" id="page-h1">
              {hero.title}
            </h1>
          </div>

          {hero.kicker ? <p className="bh-kicker rv d1">{hero.kicker}</p> : null}

          {featured ? (
            <article className="feat-post rv d2">
              <figure className="feat-media">
                {/* The source's own placeholder stands in until a cover image is uploaded. */}
                <Media
                  media={featured.coverImage as never}
                  priority
                  sizes="(max-width: 900px) 100vw, 760px"
                  fallback={
                    <div>
                      <span className="im-label">[FEATURED COVER IMAGE]</span>
                      <span className="im-hint">Recommended 16:11 · alt text describes the article</span>
                    </div>
                  }
                />
              </figure>

              <div className="feat-body">
                <span className="cat">{featured.categoryName}</span>
                <h2>
                  <Link href={`/blog/${featured.slug}/`}>{featured.title}</Link>
                </h2>
                <p>{featured.excerpt}</p>
                <div className="feat-meta">
                  <span className="by">
                    <span className="av" aria-hidden="true">
                      {monogram(featured.authorName)}
                    </span>
                    {featured.authorName}
                  </span>
                  {featuredDate.datetime ? <time dateTime={featuredDate.datetime}>{featuredDate.label}</time> : null}
                </div>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section
        className="section"
        style={{ paddingBlock: 'clamp(40px,4.6vw,64px) clamp(44px,5vw,72px)' }}
        aria-labelledby="list-h2"
      >
        <div className="wrap">
          <h2 className="sr-only" id="list-h2">
            {hero.listHeading || 'Latest articles'}
          </h2>

          <div className="blog-shell">
            <div>
              <div className="post-grid" id="postGrid">
                {rest.map((post, index) => {
                  const date = formatDate(post.publishedAt);
                  return (
                    <article key={post.id} className={`post rv d${index % 3}`} style={{ ['--c' as string]: ACCENT_HEX[post.accent] }}>
                      <div className="post-thumb">
                        <Media
                          media={post.coverImage as never}
                          sizes="(max-width: 900px) 100vw, 360px"
                          fallback={<span className="ph">[POST THUMBNAIL]</span>}
                        />
                      </div>
                      <div className="post-body">
                        <span className="cat">{post.categoryName}</span>
                        <h3>
                          {/* .stretch-link makes the whole card clickable, as in the source. */}
                          <Link className="stretch-link" href={`/blog/${post.slug}/`}>
                            {post.title}
                          </Link>
                        </h3>
                        <p>{post.excerpt}</p>
                      </div>
                      <div className="post-meta">
                        <span className="by">
                          <span className="av" aria-hidden="true">
                            {monogram(post.authorName)}
                          </span>
                          <span className="name">{post.authorName}</span>
                        </span>
                        {date.datetime ? <time dateTime={date.datetime}>{date.label}</time> : null}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/*
                Server-rendered pagination, so it works without JavaScript exactly as the
                source's static markup did — but over the articles that actually exist
                rather than the eight placeholder pages the original hard-coded.
              */}
              <nav className="pager rv" aria-label="Blog pagination">
                {pageNumber > 1 ? (
                  <Link className="nav-btn" href={href(pageNumber - 1)} aria-label="Previous page">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M14 8H3m4-4-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Prev
                  </Link>
                ) : (
                  <span className="nav-btn" aria-disabled="true" aria-label="Previous page">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M14 8H3m4-4-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Prev
                  </span>
                )}

                {pages.map((n) =>
                  n === pageNumber ? (
                    <span className="is-current" aria-current="page" key={n}>
                      {n}
                    </span>
                  ) : (
                    <Link href={href(n)} key={n}>
                      {n}
                    </Link>
                  ),
                )}

                {gap ? (
                  <>
                    <span className="gap" aria-hidden="true">
                      …
                    </span>
                    {total === pageNumber ? (
                      <span className="is-current" aria-current="page">
                        {total}
                      </span>
                    ) : (
                      <Link href={href(total)}>{total}</Link>
                    )}
                  </>
                ) : null}

                {pageNumber < posts.totalPages ? (
                  <Link className="nav-btn" href={href(pageNumber + 1)} aria-label="Next page">
                    Next
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                ) : (
                  <span className="nav-btn" aria-disabled="true" aria-label="Next page">
                    Next
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </nav>
            </div>

            <aside className="blog-side">
              <div className="hero-form rv d1">
                <h2 className="hf-title">{hero.sidebarTitle}</h2>
                <p className="hf-sub">{hero.sidebarSubtitle}</p>
                <HeroForm />
              </div>
            </aside>
          </div>
        </div>
      </section>

      <ScrollReveal />
    </>
  );
}
