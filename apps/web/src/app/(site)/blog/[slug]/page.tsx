import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { ArticleSchema, BreadcrumbSchema, FaqSchema } from '@/lib/seo/structuredData';
import { Media } from '@/components/shared/Media';
import { ArrowIcon } from '@/components/shared/Icon';
import { FaqAccordion } from '@/components/sections/Interactive';
import { ScrollReveal } from '@/components/sections/ScrollReveal';
import { HeroForm } from '@/components/forms/HeroForm';
import '@/styles/blog-detail.css';

/**
 * Blog article — `/blog/<slug>/`.
 *
 * Built from `aptentech-blog-detail.html`, which was a template of `[POST TITLE]` and
 * `[POST-SLUG]` placeholders rather than a real page, so it becomes this dynamic route
 * rather than a CMS document of its own.
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
  const [post, settings] = await Promise.all([content.post(slug), content.settings()]);

  if (!post) notFound();

  const published = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: 'Insights', path: '/blog/' },
          { name: post.title, path: `/blog/${slug}/` },
        ]}
      />
      <ArticleSchema post={post} settings={settings} />
      <FaqSchema faqs={post.faqs} />

      <article className="post">
        <header className="post-head section">
          <div className="wrap">
            <span className="bcat">{post.categoryName}</span>
            <h1>{post.title}</h1>
            {post.excerpt ? <p className="lede">{post.excerpt}</p> : null}
            <div className="post-meta">
              {post.authorName ? <span>{post.authorName}</span> : null}
              {published ? <time dateTime={post.publishedAt ?? undefined}>{published}</time> : null}
              {post.readingMinutes ? <span>{post.readingMinutes} min read</span> : null}
            </div>
          </div>
        </header>

        {post.coverImage ? (
          <div className="wrap post-cover">
            <Media media={post.coverImage as never} priority sizes="(max-width: 900px) 100vw, 900px" />
          </div>
        ) : null}

        <div className="wrap post-body">
          {/*
            The body is sanitised on write and again on read by the API, against a narrow
            allowlist. This is the only CMS-authored markup rendered on the public site.
          */}
          <div className="prose" dangerouslySetInnerHTML={{ __html: post.body }} />
        </div>

        {post.faqs?.length ? (
          <section className="section canvas" aria-labelledby="faq-h2">
            <div className="wrap">
              <h2 className="h2" id="faq-h2">
                Frequently asked questions
              </h2>
              <FaqAccordion faqs={post.faqs} />
            </div>
          </section>
        ) : null}
      </article>

      <section className="section" id="contact" aria-labelledby="lead-h2">
        <div className="wrap">
          <div className="lead">
            <div className="lead-copy">
              <h2 className="h2" id="lead-h2">
                Let&rsquo;s discuss your project
              </h2>
            </div>
            <div className="form-card">
              <HeroForm />
            </div>
          </div>
        </div>
      </section>

      {post.related?.length ? (
        <section className="section canvas" aria-labelledby="rel-h2">
          <div className="wrap">
            <h2 className="h2" id="rel-h2">
              Related reading
            </h2>
            <div className="blog-grid">
              {post.related.map((related) => (
                <article key={related.id} className="bcard rv">
                  <span className="bcat">{related.categoryName}</span>
                  <h3 className="h3-card">
                    <Link href={`/blog/${related.slug}/`}>{related.title}</Link>
                  </h3>
                  <p>{related.excerpt}</p>
                  <Link href={`/blog/${related.slug}/`} className="tlink">
                    Read article
                    <ArrowIcon />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <ScrollReveal />
    </>
  );
}
