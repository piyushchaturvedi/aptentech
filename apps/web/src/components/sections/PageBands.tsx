import Link from 'next/link';
import type { CaseStudy, FaqItem, ServiceItem, TechStackGroup, TechnologyItem } from '@aptentech/shared';
import { ACCENT_HEX } from '@aptentech/shared';
import { Icon, ArrowIcon, TickIcon } from '@/components/shared/Icon';
import { Media } from '@/components/shared/Media';
import type { ResolvedMedia } from '@/lib/api/content';
import { CaseCarousel, FaqAccordion, HomeServicePanel, StatCounters, TechStackTabs } from './Interactive';
import { TechnologyGrid } from './ServerSections';

/**
 * The home and about pages' bands.
 *
 * Neither page is an instance of a template — each is a one-off composition — so every band
 * here mirrors one section of its source page: same classes, same nesting, same reveal
 * delays. Content comes from the CMS block the band is rendered from.
 *
 * Two details differ between these pages and the service-page template and are load-bearing
 * for the stylesheet: the section head nests its eyebrow and heading in a `div` here, and
 * the services and technologies bands use `.svc-shell`/`.ai-grid` rather than the
 * `.svc-shell2`/`.ai-plain` variants.
 */

type Block = Record<string, unknown>;

const accentStyle = (accent: unknown) => ({ ['--c' as string]: ACCENT_HEX[accent as keyof typeof ACCENT_HEX] });

/** The reveal delay pattern the source uses on these pages: first card plain, then d1, d2… */
const reveal = (index: number) => (index ? `rv d${index}` : 'rv');

/**
 * The section head used across the home and about pages.
 *
 * Unlike the service-page template, the eyebrow and heading sit inside a `div` so the
 * standfirst can be laid out beside them; `center` is the source's own modifier.
 */
export function BandHead({
  eyebrow,
  title,
  lede,
  headingId,
  centred = false,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  headingId: string;
  centred?: boolean;
}) {
  if (!title) return null;
  return (
    <div className={centred ? 'sect-head center' : 'sect-head'}>
      <div>
        {eyebrow ? <span className="eyebrow rv">{eyebrow}</span> : null}
        <h2 className={`h2 rv${eyebrow ? ' d1' : ''}`} id={headingId}>
          {title}
        </h2>
      </div>
      {lede ? <p className={`lede rv d${eyebrow ? 2 : 1}`}>{lede}</p> : null}
    </div>
  );
}

/** A heading split around its gradient-filled phrase. */
function Split({ heading }: { heading?: { lead: string; highlight: string; trail: string } }) {
  if (!heading) return null;
  // The separating spaces are explicit: the parts are stored trimmed, and running them
  // together turns the join into one unbreakable word that wraps the heading onto an extra
  // line.
  return (
    <>
      {heading.lead}
      {heading.highlight ? (
        <>
          {heading.lead ? ' ' : null}
          <span className="g">{heading.highlight}</span>
          {heading.trail ? ' ' : null}
        </>
      ) : null}
      {heading.trail}
    </>
  );
}

function Buttons({ ctas, className }: { ctas: Array<{ label: string; href: string; style: string }>; className: string }) {
  if (!ctas.length) return null;

  const classFor = (style: string) =>
    style === 'mint'
      ? 'btn btn-mint'
      : style === 'glass'
        ? 'btn btn-glass'
        : style === 'ghostLight'
          ? 'btn btn-ghost-light'
          : 'btn btn-primary';

  return (
    <div className={className}>
      {ctas.map((cta, index) => {
        const internal = cta.href.startsWith('/');
        const label = (
          <>
            {cta.label}
            {index === 0 ? <ArrowIcon size={15} /> : null}
          </>
        );
        return internal ? (
          <Link key={cta.href + cta.label} href={cta.href} className={classFor(cta.style)}>
            {label}
          </Link>
        ) : (
          <a key={cta.href + cta.label} href={cta.href} className={classFor(cta.style)}>
            {label}
          </a>
        );
      })}
    </div>
  );
}

export function HomeHero({ block }: { block: Block }) {
  const ctas = (block.ctas as Array<{ label: string; href: string; style: string }>) ?? [];

  return (
    <section className="hero" aria-labelledby="hero-h1">
      <div className="wrap">
        <div className="hero-in">
          <span className="pill rv">
            <span className="dot" aria-hidden="true" /> {String(block.pillText ?? '')}{' '}
            <b>{String(block.pillStrong ?? '')}</b>
          </span>
          <h1 className="h1 rv d1" id="hero-h1">
            <Split heading={block.splitHeading as never} />
          </h1>
          {block.sub ? <p className="hero-sub rv d2">{String(block.sub)}</p> : null}
          <Buttons ctas={ctas} className="hero-cta rv d3" />
          {block.note ? <p className="hero-note rv d3">{String(block.note)}</p> : null}
        </div>
      </div>
    </section>
  );
}

export function AboutHero({ block }: { block: Block }) {
  const ctas = (block.ctas as Array<{ label: string; href: string; style: string }>) ?? [];
  const cards = (block.quickCards as Array<Record<string, string>>) ?? [];

  return (
    <section className="hero-about on-dark" aria-labelledby="page-h1">
      <div className="wrap">
        <nav className="crumb" aria-label="Breadcrumb" style={{ marginBottom: 22 }}>
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <span aria-current="page">{String(block.crumbLabel ?? '')}</span>
            </li>
          </ol>
        </nav>

        <div className="ha-grid">
          <div>
            {block.eyebrow ? <span className="eyebrow rv">{String(block.eyebrow)}</span> : null}
            <h1 className="rv d1" id="page-h1" style={{ marginTop: 14 }}>
              <Split heading={block.splitHeading as never} />
            </h1>
            {block.lede ? <p className="ha-lede rv d2">{String(block.lede)}</p> : null}
            <Buttons ctas={ctas} className="ha-cta rv d3" />
          </div>

          <div className="ha-quick rv d2">
            {cards.map((card) => (
              <div key={card.title} className="hq" style={accentStyle(card.accent)}>
                <span className="ic" aria-hidden="true">
                  <Icon name={card.icon ?? ''} size={19} />
                </span>
                <div>
                  <b>{card.title}</b>
                  <span>{card.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The counters panel.
 *
 * The home page frames it as its own `.results-sec` band with the client marquee inside;
 * the about page drops it into a plain section without the marquee. The panel markup is
 * the same in both, so one component covers them with the marquee conditional on content.
 */
export function StatsPanel({ block, headingId }: { block: Block; headingId: string }) {
  const stats = (block.stats as Array<{ value: string; suffix: string; label: string }>) ?? [];
  const slots = (block.logoSlots as string[]) ?? [];
  const framed = slots.length > 0;

  const panel = (
    <div className="results rv" {...(framed ? {} : { style: { marginTop: 0 } })}>
      <div className="results-in">
        <h2 className="h2-sm" id={headingId}>
          {String(block.title ?? '')}
        </h2>
        {block.note ? <p className="ks">{String(block.note)}</p> : null}
        <StatCounters stats={stats} />

        {framed ? (
          <div className="trusted">
            <p>{String(block.trustedLabel ?? '')}</p>
            <div className="marquee">
              {/* The track is duplicated so the CSS animation loops without a visible jump. */}
              <div className="mtrack" id="mtrack">
                {[...slots, ...slots].map((slot, index) => (
                  <div className="lslot" key={`${slot}-${index}`}>
                    {slot}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return framed ? (
    <section className="results-sec" aria-labelledby={headingId}>
      <div className="wrap">{panel}</div>
    </section>
  ) : (
    <section className="section" aria-labelledby={headingId}>
      <div className="wrap">{panel}</div>
    </section>
  );
}

export function StoryBand({ block }: { block: Block }) {
  const capabilities = (block.capabilities as string[]) ?? [];

  return (
    <section className="section canvas" id="story" aria-labelledby="story-h2">
      <div className="wrap">
        <div className="intro">
          <div className="intro-body">
            <h2 className="h2 rv" id="story-h2">
              {String(block.title ?? '')}
            </h2>
            {block.lede ? (
              <p className="lede rv d1" style={{ marginTop: 16 }}>
                {String(block.lede)}
              </p>
            ) : null}
            {capabilities.length ? (
              <>
                <h3 className="core-h3 rv d2">{String(block.capabilitiesTitle ?? '')}</h3>
                <ul className="core-ul rv d2">
                  {capabilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          <figure className="intro-media rv d3">
            <div className="im-frame">
              <Media
                media={block.image as ResolvedMedia}
                sizes="(max-width: 900px) 100vw, 520px"
                fallback={
                  <>
                    <span className="im-label">{String(block.mediaLabel ?? '')}</span>
                    <span className="im-hint">{String(block.mediaHint ?? '')}</span>
                  </>
                }
              />
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

export function ValueGrid({ block }: { block: Block }) {
  const values = (block.values as Array<Record<string, string>>) ?? [];
  if (!values.length) return null;

  return (
    <section className="section" id="values" aria-labelledby="val-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="val-h2"
        />
        <div className="val-grid">
          {values.map((value, index) => (
            <article key={value.title} className={`val ${reveal(index % 3)}`} style={accentStyle(value.accent)}>
              <div className="ic" aria-hidden="true">
                <Icon name={value.icon ?? ''} size={20} />
              </div>
              <h3 className="h3-card">{value.title}</h3>
              <p>{value.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PrincipleList({ block }: { block: Block }) {
  const principles = (block.principles as Array<Record<string, string>>) ?? [];
  if (!principles.length) return null;

  return (
    <section className="section canvas" id="how" aria-labelledby="how-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="how-h2"
        />
        <div className="prin rv">
          {principles.map((item) => (
            <article key={item.title} style={accentStyle(item.accent)}>
              <span className="n">{item.number}</span>
              <div>
                <h3 className="h3-card">{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BrandStrip({ block }: { block: Block }) {
  const slots = (block.logoSlots as string[]) ?? [];
  if (!slots.length) return null;

  return (
    <section className="section" style={{ paddingBlock: 'clamp(26px,3vw,38px)' }} aria-label="Clients and partners">
      <div className="wrap">
        {/* The label is styled inline in the source rather than through a class. */}
        <p
          style={{
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 18,
          }}
        >
          {String(block.label ?? '')}
        </p>
        <div className="marquee">
          <div className="mtrack" id="mtrack">
            {[...slots, ...slots].map((slot, index) => (
              <div className="lslot" key={`${slot}-${index}`}>
                {slot}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Splits a list into fixed-size groups, matching the source's two award columns. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const Stars = ({ count = 5, size = 17 }: { count?: number; size?: number }) => (
  <div className="stars" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
        <path d="m10 1.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6L5.1 17l.9-5.5-4-3.9 5.5-.8L10 1.8Z" />
      </svg>
    ))}
  </div>
);

export function AwardsBand({ block, canvas }: { block: Block; canvas: boolean }) {
  const awards = (block.awards as Array<Record<string, string>>) ?? [];
  const lead = (block.awardLead as Record<string, string>) ?? {};
  if (!awards.length) return null;

  return (
    <section className={canvas ? 'section canvas' : 'section'} id="awards" aria-labelledby="aw-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="aw-h2"
        />
        <div className="aw-grid">
          <div className="aw-lead rv">
            <div>
              <h3>{lead.title}</h3>
              <p>{lead.body}</p>
            </div>
            <div className="rating">
              <Stars />
              <b>{lead.rating}</b>
              <span>{lead.ratingNote}</span>
            </div>
          </div>

          {chunk(awards, 3).map((column, columnIndex) => (
            <div className="aw-list" key={`aw-col-${columnIndex}`}>
              {column.map((award, index) => (
                /*
                  Keyed by position, not by title.

                  An award title is editable content and nothing stops two of them matching —
                  which is exactly what happened once the recognition band was seeded with demo
                  values. React then warns and may reuse the wrong node between renders. Position
                  within a column is stable here because the list is never reordered client-side.
                */
                <div
                  key={`aw-${columnIndex}-${index}`}
                  className={`aw rv d${index + 1}`}
                  style={accentStyle(award.accent)}
                >
                  <div className="badge" aria-hidden="true">
                    <Icon name={award.icon ?? ''} size={21} viewBox="0 0 24 24" />
                  </div>
                  <div>
                    <b>{award.title}</b>
                    <span>{award.meta}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WhyGrid({ block }: { block: Block }) {
  const items = (block.items as Array<Record<string, string>>) ?? [];
  if (!items.length) return null;

  return (
    <section className="section" id="why" aria-labelledby="why-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="why-h2"
        />
        <div className="why-grid">
          {items.map((item, index) => (
            <article key={item.title} className={`why ${reveal(index)}`} style={accentStyle(item.accent)}>
              <div className="ic" aria-hidden="true">
                <Icon name={item.icon ?? ''} size={21} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ServiceTabsBand({ block }: { block: Block }) {
  const items = (block.items as ServiceItem[]) ?? [];
  if (!items.length) return null;

  return (
    <section className="section canvas" id="services" aria-labelledby="svc-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="svc-h2"
        />
        <HomeServicePanel items={items} />
      </div>
    </section>
  );
}

export function CaseCarouselBand({ block, items }: { block: Block; items: CaseStudy[] }) {
  if (!items.length) return null;
  const ctaLabel = String(block.ctaLabel ?? '');
  const ctaHref = String(block.ctaHref ?? '#contact');

  return (
    <section className="section" id="work" aria-labelledby="work-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="work-h2"
        />
        <CaseCarousel items={items} label="Choose case study" itemLabel="case study" />
        {ctaLabel ? (
          <div className="cc-cta rv">
            {ctaHref.startsWith('/') ? (
              <Link href={ctaHref} className="btn btn-primary btn-lg">
                {ctaLabel}
                <ArrowIcon size={17} />
              </Link>
            ) : (
              <a href={ctaHref} className="btn btn-primary btn-lg">
                {ctaLabel}
                <ArrowIcon size={17} />
              </a>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function TechTabsBand({ block }: { block: Block }) {
  const groups = (block.groups as TechStackGroup[]) ?? [];
  if (!groups.length) return null;

  return (
    <section className="section canvas" id="tech" aria-labelledby="tech-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="tech-h2"
          centred={Boolean(block.centred)}
        />
        <TechStackTabs groups={groups} />
      </div>
    </section>
  );
}

export function AiGridBand({ block }: { block: Block }) {
  const items = (block.items as TechnologyItem[]) ?? [];
  if (!items.length) return null;

  return (
    <section className="section ai-sec on-dark" id="ai" aria-labelledby="ai-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="ai-h2"
        />
        {/* The home page uses the two-column `.ai-grid`; service pages use `.ai-plain`. */}
        <TechnologyGrid items={items} className="ai-grid" cardClassName="ai" plainHeading />
      </div>
    </section>
  );
}

export function FaqShell({ block }: { block: Block }) {
  const faqs = (block.faqs as FaqItem[]) ?? [];
  if (!faqs.length) return null;

  return (
    <section className="section" id="faq" aria-labelledby="faq-h2">
      <div className="wrap">
        <BandHead
          eyebrow={String(block.eyebrow ?? '')}
          title={String(block.title ?? '')}
          lede={String(block.lede ?? '')}
          headingId="faq-h2"
        />
        <FaqAccordion
            faqs={faqs}
            categories
            aside={
              <div className="faq-ask">
                <h3 className="h3-card">{String(block.askTitle ?? '')}</h3>
                <p>{String(block.askBody ?? '')}</p>
                <a href="#contact" className="btn btn-primary btn-sm">
                  {String(block.askCtaLabel ?? '')}
                  <ArrowIcon size={14} />
                </a>
              </div>
            }
          />
      </div>
    </section>
  );
}

export function LatestInsightsBand({
  block,
  posts,
}: {
  block: Block;
  posts: Array<{
    id: string;
    slug: string;
    accent: keyof typeof ACCENT_HEX;
    categoryName: string;
    title: string;
    excerpt: string;
    coverImage: unknown;
  }>;
}) {
  if (!posts.length) return null;

  // The page decides how it labels and colours each card; the article decides the words.
  const cards = (block.insightCards as Array<{ slug: string; label: string; accent: string }>) ?? [];
  const presentation = new Map(cards.map((card) => [card.slug, card]));

  return (
    <section className="section ai-sec on-dark" id="blog" aria-labelledby="blog-h2">
      <div className="wrap">
        <div className="blog-head">
          <div>
            {block.eyebrow ? <span className="eyebrow rv">{String(block.eyebrow)}</span> : null}
            <h2 className="h2 rv d1" id="blog-h2" style={{ marginTop: 12 }}>
              {String(block.title ?? '')}
            </h2>
            {block.lede ? <p className="lede rv d2">{String(block.lede)}</p> : null}
          </div>
          <Link href="/blog/" className="blog-btn rv d2">
            {String(block.buttonLabel ?? 'View all blogs')}
            <ArrowIcon size={15} />
          </Link>
        </div>

        <div className="blog-grid">
          {posts.map((post, index) => {
            const shown = presentation.get(post.slug);
            return (
            <article
              key={post.id}
              className={`blog-card ${reveal(index)}`}
              style={{ ['--c' as string]: ACCENT_HEX[(shown?.accent as keyof typeof ACCENT_HEX) ?? post.accent] }}
            >
              <div className="blog-thumb">
                <span className="tag">{shown?.label || post.categoryName}</span>
                <Media
                  media={post.coverImage as ResolvedMedia}
                  sizes="(max-width: 900px) 100vw, 380px"
                  fallback={<span className="ph">[BLOG THUMBNAIL]</span>}
                />
              </div>
              <div className="blog-body">
                <h3 className="h3-card">{post.title}</h3>
                <p>{post.excerpt}</p>
                <Link href={`/blog/${post.slug}/`} className="blog-more">
                  Explore more
                  <ArrowIcon size={15} />
                </Link>
              </div>
            </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { TickIcon };
