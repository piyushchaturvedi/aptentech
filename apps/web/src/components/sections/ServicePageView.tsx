import Link from 'next/link';
import type { SiteSettings } from '@aptentech/shared';
import { ACCENT_HEX } from '@aptentech/shared';
import type { ResolvedMedia, ResolvedServicePage } from '@/lib/api/content';
import { Media } from '@/components/shared/Media';
import { Icon, ArrowIcon, TickIcon } from '@/components/shared/Icon';
import { HeroForm } from '@/components/forms/HeroForm';
import { LeadForm } from '@/components/forms/LeadForm';
import { ComplianceBadges, SolutionsBento, TechnologyGrid, TestimonialGrid, WhyList } from './ServerSections';
import {
  CaseCarousel,
  FaqAccordion,
  FeatureChips,
  FeatureGroups,
  ProcessTimeline,
  ServicesPanel,
  StatCounters,
  TechStackTabs,
} from './Interactive';
import { ScrollReveal } from './ScrollReveal';

/** Splits a list into fixed-size groups, used where the source lays a band out in columns. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Renders a service or solution page.
 *
 * The markup here mirrors the original pages element for element — section classes, ids,
 * nesting and the `--c` custom properties — because the stylesheet was carried over
 * verbatim and keys off exactly those. Section order is the source's own order rather than
 * anything derived, so the page reads the same top to bottom.
 *
 * One component serves all 17 pages: they share a structure, and the real differences
 * between them (a market band on solutions, chips versus tabs for features) are carried in
 * the data, not in separate templates.
 *
 * Sections an editor hides are not rendered at all rather than hidden with CSS, which is
 * how the GEO page's `#cost{display:none!important}` override was migrated.
 */

/** `.sect-head` — heading and standfirst, with no wrapper between them. */
function SectHead({
  title,
  lede,
  headingId,
  centred = false,
}: {
  title: string;
  lede?: string;
  headingId: string;
  /** Two pages centre a heading block; everywhere else it is left-aligned. */
  centred?: boolean;
}) {
  if (!title) return null;
  return (
    <div className={centred ? 'sect-head center' : 'sect-head'}>
      <h2 className="h2 rv" id={headingId}>
        {title}
      </h2>
      {lede ? <p className="lede rv d1">{lede}</p> : null}
    </div>
  );
}

/**
 * The dating page's hero overlay: seven hearts drifting behind the copy.
 *
 * Decoration, so the markup lives here and the page only stores which overlay it uses.
 * The sizes are the source's, in the source's order — the CSS positions each `i` by
 * `:nth-child`, so the order is load-bearing.
 */
const HEART_SIZES = [26, 16, 34, 20, 28, 18, 22];

const Hearts = () => (
  <div className="hearts" aria-hidden="true">
    {HEART_SIZES.map((size, i) => (
      <i key={i}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 5.8-8 11-8 11Z" />
        </svg>
      </i>
    ))}
  </div>
);

const Stars = ({ count = 5, size = 15 }: { count?: number; size?: number }) => (
  <div className="stars" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
        <path d="m10 1.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6L5.1 17l.9-5.5-4-3.9 5.5-.8L10 1.8Z" />
      </svg>
    ))}
  </div>
);

export function ServicePageView({ page, settings }: { page: ResolvedServicePage; settings: SiteSettings }) {
  const hidden = new Set(page.hiddenSections ?? []);
  const show = (key: string) => !hidden.has(key);
  const lede = (key: string) => page.sectionLedes?.[key] ?? '';
  /**
   * The section background band.
   *
   * The design alternates a tinted `.canvas` background down the page, so whether a given
   * section is banded depends on what sits above it. The page stores the ids the source
   * marked, which keeps the rhythm identical on all seventeen pages.
   */
  const band = (id: string) => (page.canvasSectionIds?.includes(id) ? 'section canvas' : 'section');

  /** Whether a section's heading block is centred, which two pages do for one band each. */
  const centred = (id: string) => Boolean(page.centredHeadIds?.includes(id));

  /*
    The breadcrumb's parent, by family.

    A lookup rather than a ternary because there are now four families: a page under
    `/industries/` that says "Solutions" in its breadcrumb is telling the reader — and the
    structured data — the wrong thing about where it sits.
  */
  const FAMILY: Record<string, { label: string; href: string }> = {
    service: { label: 'Services', href: '/services/' },
    solution: { label: 'Solutions', href: '/solutions/' },
    industry: { label: 'Industries', href: '/industries/' },
    technology: { label: 'Technologies', href: '/technologies/' },
  };

  const { label: family, href: familyHref } = FAMILY[page.kind] ?? FAMILY.solution!;

  return (
    <>
      {/* ---------------------------------------------------------------- 1. hero */}
      <section className="hero hero-split" aria-labelledby="page-h1">
        {page.heroDecoration === 'hearts' ? <Hearts /> : null}
        <div className="wrap">
          <nav className="crumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li>
                <Link href={familyHref}>{family}</Link>
              </li>
              <li>
                <span aria-current="page">{page.name}</span>
              </li>
            </ol>
          </nav>

          <div className="hs">
            <div>
              <h1 className="rv" id="page-h1">
                {page.heroTitle}
                {page.heroTitleHighlight ? (
                  <>
                    {' '}
                    <span className="g">{page.heroTitleHighlight}</span>
                  </>
                ) : null}
              </h1>

              <p className="hs-lede rv d1">{page.heroDescription}</p>

              {page.heroPoints?.length ? (
                <ul className="hs-points rv d2">
                  {page.heroPoints.map((point) => (
                    <li key={point}>
                      <TickIcon size={15} />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {page.heroCtaLabel ? (
                <div className="hs-cta rv d3">
                  <a href="#contact" className="btn btn-mint">
                    {page.heroCtaLabel}
                    <ArrowIcon size={15} />
                  </a>
                  {page.heroCtaNote ? <span className="note">{page.heroCtaNote}</span> : null}
                </div>
              ) : null}
            </div>

            <div className="hero-form rv d2">
              {page.heroFormTitle ? <h2 className="hf-title">{page.heroFormTitle}</h2> : null}
              {page.heroFormSubtitle ? <p className="hf-sub">{page.heroFormSubtitle}</p> : null}
              <HeroForm />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- 2. client / partner marquee */}
      {page.logoSlots?.length ? (
        <section className="section" style={{ paddingBlock: 'clamp(26px,3vw,38px)' }} aria-label="Clients and partners">
          <div className="wrap">
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
              {page.brandStripLabel}
            </p>
            {/*
              The track is duplicated so the marquee can loop seamlessly — the source did the
              same by appending its own innerHTML to itself once on load.
            */}
            <div className="marquee">
              <div className="mtrack" id="mtrack">
                {[...page.logoSlots, ...page.logoSlots].map((slot, i) => (
                  <div className="lslot" key={`${slot}-${i}`}>
                    {slot}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 3. protect band */}
      {page.protect?.length && show('protect') ? (
        <section className="section protect" id="protect" aria-labelledby="pro-h2">
          <div className="wrap">
            <SectHead title={page.protectTitle} lede={lede('protect')} headingId="pro-h2" centred={centred('protect')} />
            <div className="pro-grid">
              {page.protect.map((item, index) => (
                <article
                  key={item.title}
                  className={`pro rv${index ? ` d${index}` : ''}`}
                  style={{ ['--c' as string]: ACCENT_HEX[item.accent] }}
                >
                  <span className="pro-n" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="ic" aria-hidden="true">
                    <Icon name={item.icon} size={22} />
                  </div>
                  <h3 className="h3-card">{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- 4. overview */}
      {page.positioningTitle && show('positioning') ? (
        <section className={band('overview')} id="overview" aria-labelledby="ov-h2">
          <div className="wrap">
            <div className="intro">
              <div className="intro-body">
                <h2 className="h2 rv" id="ov-h2">
                  {page.positioningTitle}
                </h2>
                {page.positioningBody ? (
                  <p className="lede rv d1" style={{ marginTop: 16 }}>
                    {page.positioningBody}
                  </p>
                ) : null}

                {page.coreCapabilities?.length ? (
                  <>
                    <h3 className="core-h3 rv d2">{page.coreCapabilitiesTitle}</h3>
                    <ul className="core-ul rv d2">
                      {page.coreCapabilities.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>

              <figure className="intro-media rv d3">
                <div className="im-frame">
                  {/* Until an asset is uploaded this shows the source page's own placeholder. */}
                  <Media
                    media={page.positioningImage}
                    sizes="(max-width: 900px) 100vw, 520px"
                    fallback={
                      <>
                        <span className="im-label">{page.introMediaLabel}</span>
                        <span className="im-hint">{page.introMediaHint}</span>
                      </>
                    }
                  />
                </div>
              </figure>
            </div>
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------------- 5. market */}
      {page.marketStats?.length && show('marketContext') ? (
        <section className="section market" id="market" aria-labelledby="mkt-h2">
          <div className="wrap">
            <SectHead title={page.marketContextTitle} lede={lede('marketContext')} headingId="mkt-h2" centred={centred('market')} />
            <div className="mkt-grid rv">
              {page.marketStats.map((stat) => (
                <div className="mkt" key={stat.label}>
                  <b>{stat.value}</b>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- 6. stats */}
      {page.stats?.length && show('stats') ? (
        <section className="section" aria-labelledby="stats-h2">
          <div className="wrap">
            <div className="results rv" style={{ marginTop: 0 }}>
              <div className="results-in">
                <h2 className="h2-sm" id="stats-h2">
                  {page.statsTitle}
                </h2>
                {page.statsNote ? <p className="ks">{page.statsNote}</p> : null}
                <StatCounters stats={page.stats} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- 7. services */}
      {page.services?.length && show('services') ? (
        <section className={band('services')} id="services" aria-labelledby="svc-h2">
          <div className="wrap">
            <SectHead title={page.servicesTitle} lede={lede('services')} headingId="svc-h2" centred={centred('services')} />
            <ServicesPanel items={page.services} label={page.servicesTitle} />

            {page.servicesCtaLabel ? (
              <div className="cc-cta rv">
                <a href="#contact" className="btn btn-primary btn-lg">
                  {page.servicesCtaLabel}
                  <ArrowIcon size={17} />
                </a>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ 8. CTA strip */}
      {page.midCtaTitle && show('midCta') ? (
        <section className="section" style={{ paddingBlock: 0 }} aria-labelledby="cta1-h2">
          <div className="wrap">
            <div className="strip rv">
              <div className="strip-in">
                <div>
                  <h2 className="h2" id="cta1-h2">
                    {page.midCtaTitle}
                  </h2>
                  {page.midCtaBody ? <p>{page.midCtaBody}</p> : null}
                  {page.midCtaButton ? (
                    <a href={page.midCtaButton.href} className="btn btn-mint">
                      {page.midCtaButton.label}
                      <ArrowIcon size={15} />
                    </a>
                  ) : null}
                </div>
                {page.midCtaPoints?.length ? (
                  <div className="spoints">
                    {page.midCtaPoints.map((point) => (
                      <div className="spoint" key={point}>
                        <span className="tick" aria-hidden="true">
                          <TickIcon size={13} />
                        </span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- 9. recognition */}
      {page.recognitionTitle && show('recognition') ? (
        <section className={band('awards')} id="awards" aria-labelledby="aw-h2">
          <div className="wrap">
            <SectHead title={page.recognitionTitle} lede={lede('recognition')} headingId="aw-h2" centred={centred('awards')} />
            <div className="aw-grid">
              <div className="aw-lead rv">
                <div>
                  <h3>{page.awardLead?.title}</h3>
                  <p>{page.awardLead?.body}</p>
                </div>
                <div className="rating">
                  <Stars size={17} />
                  <b>{page.awardLead?.rating}</b>
                  <span>{page.awardLead?.ratingNote}</span>
                </div>
              </div>

              {/* The source splits the badges into two `.aw-list` columns of three, and the
                  reveal delay restarts in each — so the chunking is layout, not decoration. */}
              {chunk(page.awards, 3).map((column, columnIndex) => (
                <div className="aw-list" key={`aw-col-${columnIndex}`}>
                  {column.map((award, index) => (
                    <div
                      key={`${award.title}-${index}`}
                      className={`aw rv d${index + 1}`}
                      style={{ ['--c' as string]: ACCENT_HEX[award.accent] }}
                    >
                      <div className="badge" aria-hidden="true">
                        <Icon name={award.icon} size={21} viewBox="0 0 24 24" />
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
      ) : null}

      {/* ------------------------------------------------------------ 10. solutions */}
      {page.solutions?.length && show('solutions') ? (
        <section className={band('solutions')} id="solutions" aria-labelledby="sol-h2">
          <div className="wrap">
            <SectHead title={page.solutionsTitle} lede={lede('solutions')} headingId="sol-h2" centred={centred('solutions')} />
            <SolutionsBento items={page.solutions} />

            {page.solutionsCtaLabel ? (
              <div className="cc-cta rv">
                <a href="#contact" className="btn btn-primary btn-lg">
                  {page.solutionsCtaLabel}
                  <ArrowIcon size={17} />
                </a>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- 11. case studies */}
      {page.caseStudies?.length && show('caseStudies') ? (
        <section className={band('portfolio')} id="portfolio" aria-labelledby="pf-h2">
          <div className="wrap">
            <SectHead title={page.caseStudiesTitle} lede={lede('caseStudies')} headingId="pf-h2" centred={centred('portfolio')} />
            <CaseCarousel items={page.caseStudies} />
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- 12. testimonials */}
      {page.testimonials?.length && show('testimonials') ? (
        <section className={band('testimonials')} id="testimonials" aria-labelledby="tst-h2">
          <div className="wrap">
            <SectHead title={page.testimonialsTitle} lede={lede('testimonials')} headingId="tst-h2" centred={centred('testimonials')} />
            <TestimonialGrid items={page.testimonials} />
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------------- 13. features */}
      {page.features?.length && show('features') ? (
        <section className={band('features')} id="features" aria-labelledby="feat-h2">
          <div className="wrap">
            <SectHead title={page.featuresTitle} lede={lede('features')} headingId="feat-h2" centred={centred('features')} />
            {page.featuresLayout === 'chips' ? (
              <FeatureChips items={page.features} />
            ) : (
              <FeatureGroups items={page.features} />
            )}
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 14. technologies */}
      {page.technologies?.length && show('technologies') ? (
        <section className="section ai-sec on-dark" id="ai" aria-labelledby="ai-h2">
          <div className="wrap">
            <SectHead title={page.technologiesTitle} lede={lede('technologies')} headingId="ai-h2" centred={centred('ai')} />
            <TechnologyGrid items={page.technologies} />
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ 15. CTA strip 2 */}
      {page.midCta2Title && show('midCta2') ? (
        <section
          className="section"
          style={{ paddingBlock: 'clamp(38px,4.4vw,62px)' }}
          aria-labelledby="cta2-h2"
        >
          <div className="wrap">
            <div className="strip rv">
              <div className="strip-in">
                <div>
                  <h2 className="h2" id="cta2-h2">
                    {page.midCta2Title}
                  </h2>
                  {page.midCta2Body ? <p>{page.midCta2Body}</p> : null}
                  {page.midCta2Button ? (
                    <a href={page.midCta2Button.href} className="btn btn-mint">
                      {page.midCta2Button.label}
                      <ArrowIcon size={15} />
                    </a>
                  ) : null}
                </div>
                <figure className="cta-media">
                  <div className="cm-frame">
                    <span className="im-label">{page.midCta2MediaLabel}</span>
                    <span className="im-hint">{page.midCta2MediaHint}</span>
                  </div>
                </figure>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- 16. compliance */}
      {page.compliance?.length && show('compliance') ? (
        <section className={band('compliance')} id="compliance" aria-labelledby="comp-h2">
          <div className="wrap">
            <SectHead title={page.complianceTitle} lede={lede('compliance')} headingId="comp-h2" centred={centred('compliance')} />
            <ComplianceBadges items={page.compliance} />
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------------- 17. process */}
      {page.process?.length && show('process') ? (
        <section className={band('process')} id="process" aria-labelledby="proc-h2">
          <div className="wrap">
            <SectHead title={page.processTitle} lede={lede('process')} headingId="proc-h2" centred={centred('process')} />
            <ProcessTimeline steps={page.process} />
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------------------- 18. cost */}
      {page.pricingTitle && show('pricing') ? (
        <section className={band('cost')} id="cost" aria-labelledby="cost-h2">
          <div className="wrap">
            <SectHead title={page.pricingTitle} lede={lede('pricing')} headingId="cost-h2" centred={centred('cost')} />
            <div className="cost-wrap rv">
              {page.costTable?.rows?.length ? (
                <table className="cost-table">
                  <caption className="sr-only">{page.costTable.caption}</caption>
                  <thead>
                    <tr>
                      {page.costTable.headers.map((header) => (
                        <th scope="col" key={header}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.costTable.rows.map((row) => (
                      <tr key={row.tier}>
                        <th scope="row">
                          <span className="tier" style={{ ['--c' as string]: ACCENT_HEX[row.tierAccent] }}>
                            {row.tier}
                          </span>
                        </th>
                        <td data-l="Includes">{row.includes}</td>
                        <td data-l="Timeline">{row.timeline}</td>
                        <td data-l="Investment">
                          <b>{row.investment}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {page.costTable?.factors?.length ? (
                <div className="cost-factors">
                  <h3 className="h3-card">{page.costTable.factorsTitle}</h3>
                  <ul>
                    {page.costTable.factors.map((factor) => (
                      <li key={factor}>{factor}</li>
                    ))}
                  </ul>
                  {page.costFactorsCtaLabel ? (
                    <a href="#contact" className="btn btn-primary btn-sm">
                      {page.costFactorsCtaLabel}
                      <ArrowIcon size={15} />
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- 19. tech stack */}
      {page.techStack?.length && show('techStack') ? (
        <section className={band('tech')} id="tech" aria-labelledby="tech-h2">
          <div className="wrap">
            <SectHead title={page.techStackTitle} lede={lede('techStack')} headingId="tech-h2" centred={centred('tech')} />
            <TechStackTabs groups={page.techStack} />
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ 20. why */}
      {page.why?.length && show('why') ? (
        <section className={band('why')} id="why" aria-labelledby="why-h2">
          <div className="wrap">
            <div className="why-split">
              <div className="why-sticky">
                <h2 className="h2 rv" id="why-h2">
                  {page.whyTitle}
                </h2>
                {lede('why') ? (
                  <p className="lede rv d1" style={{ marginTop: 16 }}>
                    {lede('why')}
                  </p>
                ) : null}
                {page.whyCtaLabel ? (
                  page.whyCtaStyle === 'inline' ? (
                    <a href="#contact" className="btn btn-primary rv d2" style={{ marginTop: 24 }}>
                      {page.whyCtaLabel}
                      <ArrowIcon size={15} />
                    </a>
                  ) : (
                    <div className="cc-cta rv d2" style={{ justifyContent: 'flex-start', marginTop: 24 }}>
                      <a href="#contact" className="btn btn-primary btn-lg">
                        {page.whyCtaLabel}
                        <ArrowIcon size={17} />
                      </a>
                    </div>
                  )
                ) : null}
              </div>
              <WhyList items={page.why} />
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ 21. FAQ */}
      {page.faqs?.length && show('faqs') ? (
        <section className={band('faq')} id="faq" aria-labelledby="faq-h2">
          <div className="wrap">
            <div className="faq-head">
              <h2 className="h2 rv" id="faq-h2">
                {page.faqTitle}
              </h2>
              {lede('faqs') ? <p className="rv d1">{lede('faqs')}</p> : null}
            </div>
            <FaqAccordion faqs={page.faqs} wide />
            {page.faqAfter ? (
              <div className="faq-after rv">
                <p>{page.faqAfter}</p>
                <a href="#contact" className="btn btn-primary">
                  {page.faqAfterCtaLabel}
                  <ArrowIcon size={15} />
                </a>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------- 22. latest insights */}
      {page.latestPosts?.length && show('latestInsights') ? (
        <section className="section ai-sec on-dark" id="blog" aria-labelledby="blog-h2">
          <div className="wrap">
            <div className="blog-head">
              <div>
                <span className="eyebrow rv">From the blog</span>
                <h2 className="h2 rv d1" id="blog-h2" style={{ marginTop: 12 }}>
                  {page.latestInsightsTitle}
                </h2>
                {page.latestInsightsBody ? <p className="lede rv d2">{page.latestInsightsBody}</p> : null}
              </div>
              <Link href="/blog/" className="blog-btn rv d2">
                View all blogs
                <ArrowIcon size={15} />
              </Link>
            </div>

            <div className="blog-grid">
              {page.latestPosts.map((post, index) => (
                <article
                  key={post.id}
                  className={`blog-card rv${index ? ` d${index}` : ''}`}
                  style={{ ['--c' as string]: ACCENT_HEX[post.accent] }}
                >
                  <div className="blog-thumb">
                    <span className="tag">{post.categoryName}</span>
                    {/* The source ships its own thumbnail placeholder; keep it until a cover is uploaded. */}
                    <Media
                      media={post.coverImage as ResolvedMedia}
                      sizes="(max-width: 900px) 100vw, 380px"
                      fallback={<span className="ph">[BLOG THUMBNAIL]</span>}
                    />
                  </div>
                  <div className="blog-body">
                    {/* The source heading is plain text; the card's link is .blog-more below. */}
                    <h3 className="h3-card">{post.title}</h3>
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
        </section>
      ) : null}

      {/* ------------------------------------------------------------- 23. lead form */}
      <section className={band('contact')} id="contact" aria-labelledby="lead-h2">
        <div className="wrap">
          <div className="lead">
            <div className="lead-copy">
              <h2 className="h2 rv" id="lead-h2">
                {page.closingCtaTitle}
              </h2>
              {lede('leadForm') ? (
                <p className="lede rv d1" style={{ marginTop: 16 }}>
                  {lede('leadForm')}
                </p>
              ) : null}

              {page.leadReasons?.length ? (
                <div className="reasons rv d2">
                  {page.leadReasons.map((reason) => (
                    <div className="reason" key={reason.title} style={{ ['--c' as string]: ACCENT_HEX[reason.accent] }}>
                      <div className="ic" aria-hidden="true">
                        <Icon name={reason.icon} size={18} viewBox="0 0 20 20" />
                      </div>
                      <div>
                        <b>{reason.title}</b>
                        <span>{reason.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {page.leadOffices?.length ? (
                <div className="offices rv d3">
                  {page.leadOffices.map((office) => (
                    <div className="office" key={office.label}>
                      <p className="k">{office.label}</p>
                      <p>
                        {office.lines.map((line, i) => (
                          <span key={line}>
                            {i > 0 ? <br /> : null}
                            {line}
                          </span>
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="form-card rv d1">
              <div className="form-head">
                <h3>{page.leadForm.title}</h3>
                <span>Usually replies in a day</span>
              </div>
              <LeadForm config={page.leadForm} />
            </div>
          </div>
        </div>
      </section>

      <ScrollReveal />
    </>
  );
}
