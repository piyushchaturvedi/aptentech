import Link from 'next/link';
import type {
  ComplianceBadge,
  SolutionItem,
  TechnologyItem,
  Testimonial,
  WhyItem,
  BlogPostSummary,
} from '@aptentech/shared';
import { ACCENT_HEX } from '@aptentech/shared';
import { Icon, ArrowIcon, TickIcon } from '@/components/shared/Icon';
import { Media } from '@/components/shared/Media';
import type { ResolvedMedia } from '@/lib/api/content';

/**
 * Server-rendered sections.
 *
 * These carry the bulk of each page's commercial copy. In the source they were written into
 * the DOM with `innerHTML` from JavaScript arrays, which meant a crawler had to execute JS
 * to see any of it. Rendering them on the server puts the same markup — same classes, same
 * structure, same `--c` custom properties — directly in the HTML response.
 *
 * The `rv` class and its `d0`–`d3` delay variants are the source's scroll-reveal hooks and
 * are reproduced exactly so the animation timing is unchanged.
 */

/** Section wrapper matching the source's `<section class="section" id=…>` shape. */
export function Section({
  id,
  className = 'section',
  labelledBy,
  children,
}: {
  id?: string;
  className?: string;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className} {...(id ? { id } : {})} {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}>
      {children}
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  headingId,
  center = false,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  headingId?: string;
  center?: boolean;
}) {
  return (
    <div className="sect-head">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2 className="h2 rv" {...(headingId ? { id: headingId } : {})}>
        {title}
      </h2>
      {lede ? <p className="lede rv d1">{lede}</p> : null}
    </div>
  );
}

/** Source: the `SOL` bento grid. */
export function SolutionsBento({ items }: { items: SolutionItem[] }) {
  if (!items.length) return null;
  return (
    <div className="bento" id="bento">
      {items.map((item, index) => (
        <article
          key={`${item.title}-${index}`}
          className={`rv d${index % 3}`}
          style={{ ['--c' as string]: ACCENT_HEX[item.accent] }}
        >
          <div className="ic" aria-hidden="true">
            <Icon name={item.icon} size={21} />
          </div>
          <h3 className="h3-card">{item.title}</h3>
          <ul className="bento-ul">
            {item.bullets.map((bullet) => (
              <li key={bullet}>
                <TickIcon />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

/** Source: the `AI` "future-ready technologies" grid. */
export function TechnologyGrid({
  items,
  className = 'ai-plain',
  cardClassName = '',
  plainHeading = false,
}: {
  items: TechnologyItem[];
  /** Service pages use `.ai-plain`; the home page's band is the two-column `.ai-grid`. */
  className?: string;
  /** The home page's cards carry `.ai`; the service pages' carry no class of their own. */
  cardClassName?: string;
  /** The home page uses a bare `h3`; service pages use the card heading style. */
  plainHeading?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className={className} id="aiGrid">
      {items.map((item, index) => (
        <article
          key={`${item.title}-${index}`}
          className={`${cardClassName ? `${cardClassName} ` : ''}rv d${(index % 3) + 1}`}
          style={{ ['--c' as string]: ACCENT_HEX[item.accent] }}
        >
          <div className="ic" aria-hidden="true">
            <Icon name={item.icon} size={20} />
          </div>
          {plainHeading ? <h3>{item.title}</h3> : <h3 className="h3-card">{item.title}</h3>}
          <p>{item.description}</p>
          {/* The outcome line exists only on the home page's cards. */}
          {item.outcome ? <span className="out">{item.outcome}</span> : null}
        </article>
      ))}
    </div>
  );
}

/** Source: the `BADGES` compliance row. These icons use a 24×24 viewBox, unlike the rest. */
export function ComplianceBadges({ items }: { items: ComplianceBadge[] }) {
  if (!items.length) return null;
  return (
    <div className="comp-card" id="compList">
      {items.map((badge, index) => (
        <div
          key={`${badge.label}-${index}`}
          className={`comp-badge rv d${index % 5}`}
          style={{ ['--c' as string]: ACCENT_HEX[badge.accent] }}
        >
          <span className="shield" aria-hidden="true">
            <Icon name={badge.icon} size={24} viewBox="0 0 24 24" />
          </span>
          <span>{badge.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Source: the numbered `WHY` list. Numbering is real ordering, not decoration. */
export function WhyList({ items }: { items: WhyItem[] }) {
  if (!items.length) return null;
  return (
    <div className="nlist rv d1" id="whyList">
      {items.map((item, index) => (
        <article key={`${item.title}-${index}`}>
          <span className="n">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <h3 className="h3-card">{item.title}</h3>
            <p>{item.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function TestimonialGrid({ items }: { items: Testimonial[] }) {
  if (!items.length) return null;

  const accents = ['indigo', 'violet', 'mint', 'amber', 'cyan', 'pink'] as const;

  return (
    <div className="tst-grid">
      {items.map((t, index) => (
        <figure
          key={t.id}
          className={`tstc rv${index ? ` d${index}` : ''}`}
          style={{ ['--c' as string]: ACCENT_HEX[accents[index % accents.length]!] }}
        >
          {t.rating ? (
            <div className="stars" aria-hidden="true">
              {Array.from({ length: Math.round(t.rating) }).map((_, i) => (
                <svg key={i} width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                  <path d="m10 1.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6L5.1 17l.9-5.5-4-3.9 5.5-.8L10 1.8Z" />
                </svg>
              ))}
            </div>
          ) : null}
          <blockquote>&ldquo;{t.content}&rdquo;</blockquote>
          <figcaption>
            <span className="av" aria-hidden="true">
              {t.name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <b>{t.name}</b>
              <em>
                {t.designation}
                {t.designation && t.company ? ', ' : ''}
                {t.company}
              </em>
            </span>
          </figcaption>
          {t.industry || t.duration ? (
            <div className="tst-meta">
              {t.industry ? <span>Industry: {t.industry}</span> : null}
              {t.duration ? <span>Duration: {t.duration}</span> : null}
            </div>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

/** A CTA band. `onDark` reproduces the source's inverted variant. */
export function CtaBand({
  title,
  body,
  href = '#contact',
  label = 'Book a call',
  id,
  headingId,
}: {
  title: string;
  body?: string;
  href?: string;
  label?: string;
  id?: string;
  headingId?: string;
}) {
  if (!title) return null;
  const internal = href.startsWith('/');

  return (
    <section className="section" {...(id ? { id } : {})}>
      <div className="wrap">
        <div className="strip rv">
          <div className="strip-in">
            <div>
              <h2 className="h2-sm" {...(headingId ? { id: headingId } : {})}>
                {title}
              </h2>
              {body ? <p>{body}</p> : null}
              {internal ? (
                <Link href={href} className="btn btn-mint">
                  {label}
                  <ArrowIcon size={15} />
                </Link>
              ) : (
                <a href={href} className="btn btn-mint">
                  {label}
                  <ArrowIcon size={15} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Two-column text-and-image block, used for the positioning section. */
export function ImageTextSection({
  title,
  body,
  image,
  headingId,
  id,
}: {
  title: string;
  body?: string;
  image?: ResolvedMedia | null;
  headingId?: string;
  id?: string;
}) {
  if (!title) return null;
  return (
    <Section id={id} className="section canvas" labelledBy={headingId}>
      <div className="wrap">
        <div className="intro">
          <div className="intro-body">
            <h2 className="h2 rv" {...(headingId ? { id: headingId } : {})}>
              {title}
            </h2>
            {body ? <p className="lede rv d1">{body}</p> : null}
          </div>
          {image ? (
            <div className="im-frame rv d2">
              <Media media={image} sizes="(max-width: 900px) 100vw, 520px" />
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

export function LatestInsights({ title, posts }: { title: string; posts: BlogPostSummary[] }) {
  if (!posts.length) return null;
  return (
    <Section id="blog" labelledBy="blog-h2">
      <div className="wrap">
        <SectionHead title={title} headingId="blog-h2" />
        <div className="blog-grid">
          {posts.map((post, index) => (
            <article
              key={post.id}
              className={`blog-card rv${index ? ` d${index}` : ''}`}
              style={{ ['--c' as string]: ACCENT_HEX[post.accent] }}
            >
              <div className="blog-thumb">
                <span className="tag">{post.categoryName}</span>
                {/* The thumbnail slot: shows the cover once uploaded, its placeholder until then. */}
                <Media media={post.coverImage as ResolvedMedia} sizes="(max-width: 900px) 100vw, 380px" />
              </div>
              <div className="blog-body">
                <h3 className="h3-card">
                  <Link href={`/blog/${post.slug}/`}>{post.title}</Link>
                </h3>
                <p>{post.excerpt}</p>
                <Link href={`/blog/${post.slug}/`} className="blog-more">
                  Explore more
                  <ArrowIcon size={15} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}
