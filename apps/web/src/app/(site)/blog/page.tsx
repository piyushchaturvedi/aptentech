import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCENT_HEX } from '@aptentech/shared';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema } from '@/lib/seo/structuredData';
import { Media } from '@/components/shared/Media';
import { ArrowIcon } from '@/components/shared/Icon';
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
 * Articles change more often than service pages, so this revalidates on a shorter interval
 * as well as on publish.
 */
export const revalidate = 900;

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

  const [posts, settings, cmsPage] = await Promise.all([
    content.blog(pageNumber, 9, { category: params.category, tag: params.tag }),
    content.settings(),
    content.page('blog'),
  ]);

  const heroBlock = cmsPage?.blocks?.find((b) => b.type === 'hero');
  const heroFormBlock = cmsPage?.blocks?.find((b) => b.type === 'leadFormSection' && b.key === 'hero-form');
  const [featured, ...rest] = posts.items;

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: 'Insights', path: '/blog/' },
        ]}
      />

      <section className="hero" aria-labelledby="hero-h1">
        <div className="wrap hero-in">
          <div className="hero-copy">
            {heroBlock?.eyebrow ? <span className="eyebrow">{heroBlock.eyebrow}</span> : null}
            <h1 id="hero-h1">{heroBlock?.title ?? 'Engineering insights from the people who build'}</h1>
            {heroBlock?.body ? <p className="lede">{heroBlock.body}</p> : null}
          </div>
          <div className="hero-form-card">
            {/* The source gives this form its own heading; it is content, so it comes from the CMS. */}
            {heroFormBlock?.title ? <h2 className="hf-title">{heroFormBlock.title}</h2> : null}
            {heroFormBlock?.body ? <p className="hf-sub">{heroFormBlock.body}</p> : null}
            <HeroForm />
          </div>
        </div>
      </section>

      {featured ? (
        <section className="section" aria-labelledby="feat-h2">
          <div className="wrap">
            <article className="bfeature rv" style={{ ['--c' as string]: ACCENT_HEX[featured.accent] }}>
              <div className="bfeature-media">
                <Media media={featured.coverImage as never} priority sizes="(max-width: 900px) 100vw, 760px" />
              </div>
              <div className="bfeature-copy">
                <span className="bcat">{featured.categoryName}</span>
                <h2 className="h2-sm" id="feat-h2">
                  <Link href={`/blog/${featured.slug}/`}>{featured.title}</Link>
                </h2>
                <p>{featured.excerpt}</p>
                <Link href={`/blog/${featured.slug}/`} className="tlink">
                  Read article
                  <ArrowIcon />
                </Link>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <section className="section canvas" aria-labelledby="latest-h2">
        <div className="wrap">
          <div className="sect-head">
            <div>
              <h2 className="h2 rv" id="latest-h2">
                Latest articles
              </h2>
            </div>
          </div>

          {rest.length ? (
            <div className="blog-grid">
              {rest.map((post, index) => (
                <article
                  key={post.id}
                  className={`bcard rv d${index % 3}`}
                  style={{ ['--c' as string]: ACCENT_HEX[post.accent] }}
                >
                  <span className="bcat">{post.categoryName}</span>
                  <h3 className="h3-card">
                    <Link href={`/blog/${post.slug}/`}>{post.title}</Link>
                  </h3>
                  <p>{post.excerpt}</p>
                  <Link href={`/blog/${post.slug}/`} className="tlink">
                    Read article
                    <ArrowIcon />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="lede">No articles published yet.</p>
          )}

          {posts.totalPages > 1 ? (
            <nav className="pager" aria-label="Blog pagination">
              {pageNumber > 1 ? <Link href={`/blog/?page=${pageNumber - 1}`}>Previous</Link> : null}
              <span>
                Page {pageNumber} of {posts.totalPages}
              </span>
              {pageNumber < posts.totalPages ? <Link href={`/blog/?page=${pageNumber + 1}`}>Next</Link> : null}
            </nav>
          ) : null}
        </div>
      </section>

      <ScrollReveal />
    </>
  );
}
