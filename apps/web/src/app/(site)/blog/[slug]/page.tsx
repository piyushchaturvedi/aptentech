import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ACCENT_HEX } from '@aptentech/shared';
import { content } from '@/lib/api/content';
import { SITE_URL, buildMetadata } from '@/lib/seo/metadata';
import { ArticleSchema, BreadcrumbSchema, FaqSchema } from '@/lib/seo/structuredData';
import { Media } from '@/components/shared/Media';
import { ArticleProgress, TocHighlight } from '@/components/sections/ArticleToc';
import { ShareRow } from '@/components/sections/ShareRow';
import { ScrollReveal } from '@/components/sections/ScrollReveal';
import { HeroForm } from '@/components/forms/HeroForm';
import '@/styles/blog-detail.css';

/**
 * Blog article — `/blog/<slug>/`.
 *
 * Built from `aptentech-blog-detail.html`, which was a template of `[POST TITLE]` and
 * `[POST-SLUG]` placeholders rather than a real page, so it becomes this dynamic route
 * rather than a CMS document of its own. Its layout is the source's: the banner, then a
 * three-column shell of contents, article and enquiry form, then the related band.
 *
 * The contents list is built on the server from the article's own headings, which is what
 * the source's script did in the browser — same result, but present for crawlers and
 * without JavaScript.
 *
 * Published articles are pre-rendered; anything published later is generated on first
 * request and then cached, so a new post is live without a rebuild.
 */
export const revalidate = 900;
export const dynamicParams = true;

export async function generateStaticParams() {
  const posts = await content.blog(1, 50);
  return posts.items.map((post) => ({ slug: post.slug }));
}

/** Matches the source's `19 Aug 2026`. */
function formatDate(iso: string | null | undefined): { datetime: string; label: string } {
  if (!iso) return { datetime: '', label: '' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { datetime: '', label: '' };
  return {
    datetime: date.toISOString().slice(0, 10),
    label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

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

/**
 * Gives every top-level heading in the article an id and returns the contents entries.
 *
 * The source generated these ids in the browser (`h-1`, `h-2`, …) and built the list from
 * them. Doing it here keeps the anchors identical while putting the list in the HTML.
 */
function withHeadingIds(html: string): { html: string; toc: Array<{ id: string; text: string; level: 2 | 3 }> } {
  const toc: Array<{ id: string; text: string; level: 2 | 3 }> = [];
  let n = 0;

  const out = html.replace(/<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/g, (match, tag: string, attrs: string, inner: string) => {
    const existing = attrs.match(/\bid="([^"]*)"/)?.[1];
    const id = existing ?? `h-${++n}`;
    const text = inner.replace(/<[^>]*>/g, '').trim();
    toc.push({ id, text, level: tag === 'h3' ? 3 : 2 });
    return existing ? match : `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
  });

  return { html: out, toc };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [post, settings] = await Promise.all([content.post(slug), content.settings()]);
  if (!post) return {};

  return buildMetadata({
    seo: post.seo,
    settings,
    path: `/blog/${slug}/`,
    fallbackTitle: post.title,
    fallbackDescription: post.excerpt,
    ogImage: post.coverImage as never,
    type: 'article',
    publishedTime: post.publishedAt,
  });
}

export default async function ArticleRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [post, settings, blogPage] = await Promise.all([
    content.post(slug),
    content.settings(),
    content.page('blog'),
  ]);

  if (!post) notFound();

  const t = (blogPage?.blocks?.find((b) => b.type === 'articleTemplate') ?? {}) as Record<string, string>;
  const published = formatDate(post.publishedAt);
  const updated = formatDate(post.updatedAt);
  const { html: body, toc } = withHeadingIds(post.body ?? '');

  const related = post.related ?? [];
  const [previous, next] = [related[0], related[1]];

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: t.crumbLabel || 'Insights', path: '/blog/' },
          { name: post.title, path: `/blog/${slug}/` },
        ]}
      />
      <ArticleSchema post={post} settings={settings} />
      <FaqSchema faqs={post.faqs} />

      <ArticleProgress />

      <article>
        <header className="post-hero">
          <div className="wrap">
            <nav className="crumb" aria-label="Breadcrumb" style={{ marginBottom: 16 }}>
              <ol>
                <li>
                  <Link href="/">Home</Link>
                </li>
                <li>
                  <Link href="/blog/">{t.crumbLabel || 'Insights'}</Link>
                </li>
                <li>
                  <span aria-current="page">{post.title}</span>
                </li>
              </ol>
            </nav>

            <div className="ph-in">
              <span className="ph-cat">{post.categoryName}</span>
              <h1 id="post-h1">{post.title}</h1>
              {post.excerpt ? <p className="ph-standfirst">{post.excerpt}</p> : null}

              <div className="ph-meta">
                <span className="by">
                  <span className="av" aria-hidden="true">
                    {monogram(post.authorName)}
                  </span>
                  <span className="who">
                    <b>{post.authorName}</b>
                    {post.authorRole ? <span>{post.authorRole}</span> : null}
                  </span>
                </span>
                {published.datetime ? (
                  <>
                    <span className="dot" aria-hidden="true" />
                    <time dateTime={published.datetime}>{published.label}</time>
                  </>
                ) : null}
                {post.readingMinutes ? (
                  <>
                    <span className="dot" aria-hidden="true" />
                    <span className="read">{post.readingMinutes} min read</span>
                  </>
                ) : null}
                {updated.datetime ? (
                  <>
                    <span className="dot" aria-hidden="true" />
                    <span className="read">Updated {updated.label}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <section className="section" style={{ paddingBlock: 'clamp(34px,4vw,54px) clamp(44px,5vw,72px)' }}>
          <div className="wrap">
            <div className="post-shell">
              <nav className="post-toc" aria-label="Table of contents">
                <p className="k">{t.tocLabel || 'Table of contents'}</p>
                <ol id="toc">
                  {toc.map((entry) => (
                    <li key={entry.id}>
                      <a href={`#${entry.id}`} {...(entry.level === 3 ? { className: 'lvl3' } : {})}>
                        {entry.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="article" id="article">
                {/*
                  Sanitised on write and again on read, against a profile that keeps the
                  article furniture the design styles — takeaway panels, table wrappers,
                  pull quotes, figures and anchored sections — and nothing else.
                */}
                <div dangerouslySetInnerHTML={{ __html: body }} />

                {/* The foot always carries the share row; the tag list fills when tags are set. */}
                <div className="post-foot">
                  <div className="tags">
                    {(post.tags ?? []).map((tag) => (
                      <Link key={tag} href={`/blog/?tag=${encodeURIComponent(tag)}`}>
                        {tag}
                      </Link>
                    ))}
                  </div>
                  <ShareRow
                    label={t.shareLabel || 'Share'}
                    title={post.title}
                    url={`${SITE_URL}/blog/${slug}/`}
                  />
                </div>

                {post.authorName ? (
                  <div className="author-box">
                    <span className="av" aria-hidden="true">
                      {monogram(post.authorName)}
                    </span>
                    <div>
                      <p className="k">{t.authorLabel || 'Written by'}</p>
                      <h3>{post.authorName}</h3>
                      {post.authorBio ? <p>{post.authorBio}</p> : null}
                    </div>
                  </div>
                ) : null}

                {previous || next ? (
                  <nav className="pn" aria-label="More articles">
                    {previous ? (
                      <Link href={`/blog/${previous.slug}/`}>
                        <span className="k">{t.prevLabel || '← Previous'}</span>
                        <b>{previous.title}</b>
                      </Link>
                    ) : null}
                    {next ? (
                      <Link href={`/blog/${next.slug}/`} className="next">
                        <span className="k">{t.nextLabel || 'Next →'}</span>
                        <b>{next.title}</b>
                      </Link>
                    ) : null}
                  </nav>
                ) : null}
              </div>

              <aside className="post-side">
                <div className="hero-form">
                  <h2 className="hf-title">{t.sidebarTitle}</h2>
                  <p className="hf-sub">{t.sidebarSubtitle}</p>
                  <HeroForm />
                </div>
              </aside>
            </div>
          </div>
        </section>
      </article>

      {related.length ? (
        <section className="section canvas" id="related" aria-labelledby="rel-h2">
          <div className="wrap">
            <div className="sect-head">
              <h2 className="h2 rv" id="rel-h2">
                {t.relatedTitle || 'Related reading'}
              </h2>
              {t.relatedLede ? <p className="lede rv d1">{t.relatedLede}</p> : null}
            </div>
            <div className="post-grid" id="relGrid">
              {related.map((item, index) => {
                const date = formatDate(item.publishedAt);
                return (
                  <article
                    key={item.id}
                    className={`post rv d${index % 3}`}
                    style={{ ['--c' as string]: ACCENT_HEX[item.accent] }}
                  >
                    <div className="post-thumb">
                      <Media
                        media={item.coverImage as never}
                        sizes="(max-width: 900px) 100vw, 360px"
                        fallback={<span className="ph">[POST THUMBNAIL]</span>}
                      />
                    </div>
                    <div className="post-body">
                      <span className="cat">{item.categoryName}</span>
                      <h3>
                        {/* The related band links the title only; the listing grid stretches its link. */}
                        <Link href={`/blog/${item.slug}/`}>{item.title}</Link>
                      </h3>
                      <p>{item.excerpt}</p>
                    </div>
                    <div className="post-meta">
                      <span className="by">
                        <span className="av" aria-hidden="true">
                          {monogram(item.authorName)}
                        </span>
                        <span className="name">{item.authorName}</span>
                      </span>
                      {date.datetime ? <time dateTime={date.datetime}>{date.label}</time> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <TocHighlight />
      <ScrollReveal />
    </>
  );
}
