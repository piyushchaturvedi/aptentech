import Link from 'next/link';
import type { PageBlock, SiteSettings, LeadFormConfig } from '@aptentech/shared';
import { ACCENT_HEX } from '@aptentech/shared';
import type { ResolvedSitePage } from '@/lib/api/content';
import { Media } from '@/components/shared/Media';
import { LeadForm } from '@/components/forms/LeadForm';
import { ArrowIcon, Icon, TickIcon } from '@/components/shared/Icon';
import {
  ComplianceBadges,
  Section,
  SectionHead,
  SolutionsBento,
  TechnologyGrid,
  TestimonialGrid,
} from './ServerSections';
import { CaseCarousel, FaqAccordion, ProcessTimeline, ServicesPanel, StatCounters } from './Interactive';
import { ContactBanner, OfficeCards, RouteGrid, StepGrid } from './ContactSections';
import { CaseStudyList, PortfolioHero } from './PortfolioSections';
import {
  AboutHero,
  AiGridBand,
  AwardsBand,
  BandHead,
  BrandStrip,
  CaseCarouselBand,
  FaqShell,
  HomeHero,
  LatestInsightsBand,
  PrincipleList,
  ServiceTabsBand,
  StatsPanel,
  StoryBand,
  TechTabsBand,
  ValueGrid,
  WhyGrid,
} from './PageBands';
import { ScrollReveal } from './ScrollReveal';

/**
 * Renders a CMS page from its typed blocks.
 *
 * The block set is closed: an editor picks from these and fills their fields, so nothing
 * they can do produces markup the stylesheet does not already style. There is no raw-HTML
 * block and no free-form page builder, which is what keeps the approved layout safe while
 * every word on the page stays editable.
 *
 * An unknown block type renders nothing rather than throwing — a page saved by a newer
 * version of the CMS degrades quietly instead of taking the route down.
 */

type Block = PageBlock & Record<string, unknown>;

/**
 * A legal document: privacy policy, terms and conditions.
 *
 * The source renders these as a two-column shell — a sticky contents list beside numbered
 * clauses, each in its own anchored `<section>` — rather than as a run of prose, and the
 * stylesheet targets that structure directly. The clause body is stored as one sanitised
 * HTML string so the nested cards, sub-headings and lists survive intact; the contents
 * list, which the original built in JavaScript, is rendered here on the server so it works
 * without it and is visible to crawlers.
 */
function LegalDocument({ block }: { block: Block }) {
  const heading = String(block.heading ?? block.title ?? '');
  const meta = (block.meta as string[] | undefined) ?? [];
  const clauses = (block.clauses as Array<{ id: string; number: string; title: string }> | undefined) ?? [];
  const notice = String(block.notice ?? '');
  const bodyHtml = String(block.bodyHtml ?? block.html ?? '');

  return (
    <>
      <section className="legal-hero" aria-labelledby="page-h1">
        <div className="wrap">
          <nav className="crumb" aria-label="Breadcrumb" style={{ marginBottom: 14 }}>
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li>
                <span aria-current="page">{heading}</span>
              </li>
            </ol>
          </nav>
          <h1 id="page-h1">{heading}</h1>
          {meta.length ? (
            <div className="legal-meta">
              {meta.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section
        className="section"
        style={{ paddingBlock: 'clamp(34px,4vw,54px) clamp(44px,5vw,72px)' }}
      >
        <div className="wrap">
          {/* Cleared in the CMS when the document has been through legal review. */}
          {notice ? <div className="legal-notice" dangerouslySetInnerHTML={{ __html: notice }} /> : null}

          <div className="legal-shell">
            <nav className="legal-toc" aria-label="On this page">
              <p className="k">{String(block.tocLabel ?? 'On this page')}</p>
              <ol id="toc">
                {clauses.map((clause) => (
                  <li key={clause.id}>
                    <a href={`#${clause.id}`}>{clause.title}</a>
                  </li>
                ))}
              </ol>
            </nav>

            {/* Sanitised on write and again on read, against a profile that keeps exactly
                the clause structure the design styles and nothing else. */}
            <div className="legal-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </div>
        </div>
      </section>
    </>
  );
}

function CtaList({
  ctas,
  className = 'hero-cta',
}: {
  ctas?: Array<{ label: string; href: string; style: string }>;
  /** .hero-cta in a hero; the strip band has no wrapper class of its own. */
  className?: string;
}) {
  if (!ctas?.length) return null;
  // An empty className renders the buttons with no wrapper, which is what the strip band
  // does; the hero wraps them in .hero-cta.
  return (
    <div {...(className ? { className } : {})}>
      {ctas.map((cta) =>
        cta.href.startsWith('/') ? (
          <Link key={cta.href + cta.label} href={cta.href} className={`btn btn-${cta.style}`}>
            {cta.label}
            <ArrowIcon size={15} />
          </Link>
        ) : (
          <a key={cta.href + cta.label} href={cta.href} className={`btn btn-${cta.style}`}>
            {cta.label}
            <ArrowIcon size={15} />
          </a>
        ),
      )}
    </div>
  );
}

export function PageBlocks({ page, settings }: { page: ResolvedSitePage; settings: SiteSettings }) {
  const blocks = (page.blocks ?? []).filter((b) => b.enabled !== false) as Block[];

  return (
    <>
      {blocks.map((block, index) => {
        const key = block.key || `${block.type}-${index}`;

        switch (block.type) {
          case 'hero':
            return (
              <section
                key={key}
                className={`hero${block.onDark ? ' on-dark' : ''}`}
                aria-labelledby="hero-h1"
              >
                {/* Matches the source homepage: .wrap > .hero-in, with the pill above the H1. */}
                <div className="wrap">
                  <div className="hero-in">
                    {block.eyebrow ? (
                      <span className="pill rv">
                        <span className="dot" aria-hidden="true" />
                        {block.eyebrow}
                      </span>
                    ) : null}
                    <h1 className="h1 rv d1" id="hero-h1">
                      {block.title}
                    </h1>
                    {block.body ? <p className="hero-sub rv d2">{block.body}</p> : null}
                    <CtaList ctas={block.ctas} />
                    {block.image && (block.image.legacyPath || (block.image as { url?: string }).url) ? (
                      <div className="im-frame rv d3">
                        <Media media={block.image as never} priority sizes="(max-width: 900px) 100vw, 640px" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            );

          case 'statsBar':
            return (
              <Section key={key} id="results" labelledBy="res-h2">
                <div className="wrap">
                  <div className="results-in">
                    <h2 className="h2-sm" id="res-h2">
                      {block.title}
                    </h2>
                    {block.body ? <p className="ks">{block.body}</p> : null}
                    <StatCounters stats={(block.stats ?? []) as never} />
                  </div>
                </div>
              </Section>
            );

          case 'serviceGrid':
            return (
              <Section key={key} id="services" labelledBy="svc-h2">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} lede={block.body} headingId="svc-h2" />
                  <ServicesPanel items={(block.items ?? []) as never} />
                </div>
              </Section>
            );

          case 'solutionsBento':
            return (
              <Section key={key} id="solutions" className="section canvas" labelledBy="sol-h2">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} lede={block.body} headingId="sol-h2" />
                  <SolutionsBento items={(block.items ?? []) as never} />
                </div>
              </Section>
            );

          case 'technologySection':
            return (
              <Section key={key} id="ai" className="section canvas" labelledBy="ai-h2">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} lede={block.body} headingId="ai-h2" />
                  <TechnologyGrid items={(block.items ?? []) as never} />
                </div>
              </Section>
            );

          case 'complianceBadges':
            return (
              <Section key={key} id="compliance" labelledBy="comp-h2">
                <div className="wrap">
                  <BandHead
                    eyebrow={String(block.eyebrow ?? '')}
                    title={String(block.title ?? '')}
                    lede={String(block.lede ?? block.body ?? '')}
                    headingId="comp-h2"
                  />
                  <ComplianceBadges items={(block.badges ?? []) as never} />
                </div>
              </Section>
            );

          case 'processSection':
            return (
              <Section key={key} id="process" className="section canvas" labelledBy="proc-h2">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} lede={block.body} headingId="proc-h2" />
                  <ProcessTimeline steps={(block.steps ?? []) as never} />
                </div>
              </Section>
            );

          case 'portfolioGrid':
            if (!page.caseStudies?.length) return null;
            return (
              <Section key={key} id="work" labelledBy="pf-h2">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} lede={block.body} headingId="pf-h2" />
                  <CaseCarousel items={page.caseStudies.slice(0, block.limit ?? 12)} />
                </div>
              </Section>
            );

          case 'testimonialSection':
            if (!page.testimonials?.length) return null;
            return (
              <Section key={key} id="testimonials" className="section canvas" labelledBy="tst-h2">
                <div className="wrap">
                  <BandHead
                    eyebrow={String(block.eyebrow ?? '')}
                    title={String(block.title ?? '')}
                    lede={String(block.lede ?? block.body ?? '')}
                    headingId="tst-h2"
                  />
                  <TestimonialGrid items={page.testimonials.slice(0, block.limit ?? 6)} />
                </div>
              </Section>
            );

          case 'faqSection':
            return (
              <Section key={key} id="faq" labelledBy="faq-h2">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} lede={block.body} headingId="faq-h2" center />
                  <FaqAccordion faqs={(block.faqs ?? []) as never} categories />
                </div>
              </Section>
            );

          case 'blogSection': {
            const posts = page.latestPosts ?? [];
            if (!posts.length) return null;
            return (
              <Section key={key} id="blog" labelledBy="blog-h2">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} headingId="blog-h2" />
                  <div className="blog-grid">
                    {posts.slice(0, block.limit ?? 3).map((post) => (
                      <article key={post.id} className="blog-card rv">
                        <div className="blog-thumb">
                          <span className="tag">{post.categoryName}</span>
                          <Media media={post.coverImage as never} sizes="(max-width: 900px) 100vw, 380px" />
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

          case 'officeGrid':
            return (
              <Section key={key} id="offices">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} headingId="off-h2" />
                  <div className="offices">
                    {(block.offices ?? []).map((office) => (
                      <div className="office" key={office.city}>
                        <div className="k">{office.city}</div>
                        {office.lines.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            );

          case 'textSection':
          case 'richText':
          case 'homeHero':
            return <HomeHero key={key} block={block} />;

          case 'aboutHero':
            return <AboutHero key={key} block={block} />;

          case 'statsPanel':
            return <StatsPanel key={key} block={block} headingId={block.key === 'results' ? 'res-h2' : 'stats-h2'} />;

          case 'storyBand':
            return <StoryBand key={key} block={block} />;

          case 'valueGrid':
            return <ValueGrid key={key} block={block} />;

          case 'principleList':
            return <PrincipleList key={key} block={block} />;

          case 'brandStrip':
            return <BrandStrip key={key} block={block} />;

          case 'awardsBand':
            // The band is banded on the about page and plain on the home page, matching the
            // alternating background each page happens to land on.
            return <AwardsBand key={key} block={block} canvas={page.slug === 'about'} />;

          case 'whyGrid':
            return <WhyGrid key={key} block={block} />;

          case 'serviceTabs':
            return <ServiceTabsBand key={key} block={block} />;

          case 'caseCarousel':
            return <CaseCarouselBand key={key} block={block} items={page.caseStudies ?? []} />;

          case 'techTabs':
            return <TechTabsBand key={key} block={block} />;

          case 'aiGrid':
            return <AiGridBand key={key} block={block} />;

          case 'faqShell':
            return <FaqShell key={key} block={block} />;

          case 'latestInsights':
            return <LatestInsightsBand key={key} block={block} posts={(page.latestPosts ?? []) as never} />;

          case 'portfolioHero':
            return <PortfolioHero key={key} block={block} />;

          case 'caseStudyList':
            return <CaseStudyList key={key} block={block} items={page.caseStudies ?? []} />;

          case 'contactBanner':
            return <ContactBanner key={key} block={block} />;

          case 'stepGrid':
            return <StepGrid key={key} block={block} />;

          case 'routeGrid':
            return <RouteGrid key={key} block={block} />;

          case 'officeCards':
            return <OfficeCards key={key} block={block} />;

          case 'legalDocument':
            return <LegalDocument key={key} block={block} />;

          case 'legalSection':
            return (
              <Section key={key} id={block.type === 'legalSection' ? 'legal' : undefined}>
                <div className="wrap">
                  {block.title ? <h2 className="h2">{block.title}</h2> : null}
                  {/*
                    Server-sanitised on write and again on read, with a narrow allowlist —
                    this is the only place CMS-authored markup reaches the page.
                  */}
                  <div className="prose" dangerouslySetInnerHTML={{ __html: String(block.html ?? '') }} />
                </div>
              </Section>
            );

          case 'ctaSection': {
            const points = (block.points as string[]) ?? [];
            const headingId = String(block.headingId ?? `${block.key}-h2`);

            return (
              <section
                key={key}
                className="section canvas"
                aria-labelledby={headingId}
                {...(block.paddingBlock ? { style: { paddingBlock: String(block.paddingBlock) } } : {})}
              >
                <div className="wrap">
                  <div className="strip rv">
                    <div className="strip-in">
                      <div>
                        {block.eyebrow ? <span className="eyebrow">{String(block.eyebrow)}</span> : null}
                        <h2 className="h2" id={headingId}>
                          {block.title}
                        </h2>
                        {block.body ? <p>{block.body}</p> : null}
                        <CtaList ctas={block.ctas} className="" />
                      </div>

                      {/* The guarantees beside the copy: each is a tick and a line. */}
                      {points.length ? (
                        <div className="spoints">
                          {points.map((point) => (
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
            );
          }

          case 'leadFormSection': {
            /*
              The band's own copy, the reasons to write and the office summary all come from
              the page. The home page adds an eyebrow above the heading, which in the source
              pushes every reveal delay below it one step later — so the offset is derived
              from the eyebrow rather than stored separately.
            */
            const config = (block.leadForm as LeadFormConfig | undefined) ?? {
              title: 'Get a free consultation',
              submitLabel: (block.submitLabel as string) || 'Get a Free Consultation',
              serviceLabel: 'Service required',
              serviceOptions: (block.serviceOptions as string[]) ?? [],
              budgetLabel: 'Approximate budget',
              budgetOptions: [],
              budgetNote: '',
              detailsLabel: 'Project details',
              detailsPlaceholder: '',
              reassurance: 'No obligation. Your project details remain confidential.',
            };

            const eyebrow = String(block.eyebrow ?? '');
            const shift = eyebrow ? 1 : 0;
            const reasons = (block.reasons as Array<Record<string, string>>) ?? [];
            const offices = (block.offices as Array<{ label: string; lines: string[] }>) ?? [];

            return (
              <Section
                key={key}
                className={page.slug === 'home' || page.slug === 'case-studies' ? 'section canvas' : 'section'}
                id="contact"
                labelledBy="lead-h2"
              >
                <div className="wrap">
                  <div className="lead">
                    <div className="lead-copy">
                      {eyebrow ? <span className="eyebrow rv">{eyebrow}</span> : null}
                      <h2 className={`h2 rv${shift ? ' d1' : ''}`} id="lead-h2">
                        {block.title}
                      </h2>
                      {block.lede || block.body ? (
                        <p className={`lede rv d${1 + shift}`} style={{ marginTop: 16 }}>
                          {String(block.lede ?? block.body ?? '')}
                        </p>
                      ) : null}

                      {reasons.length ? (
                        <div className={`reasons rv d${2 + shift}`}>
                          {reasons.map((reason, i) => (
                            <div
                              key={`${reason.title}-${i}`}
                              className="reason"
                              style={{ ['--c' as string]: ACCENT_HEX[reason.accent as keyof typeof ACCENT_HEX] }}
                            >
                              <div className="ic" aria-hidden="true">
                                <Icon name={reason.icon ?? ''} size={18} viewBox="0 0 20 20" />
                              </div>
                              <div>
                                <b>{reason.title}</b>
                                <span>{reason.description}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {offices.length ? (
                        <div className={`offices rv d${3 + shift}`}>
                          {offices.map((office) => (
                            <div className="office" key={office.label}>
                              <p className="k">{office.label}</p>
                              <p>
                                {office.lines.map((line, i) => (
                                  <span key={line}>
                                    {i ? <br /> : null}
                                    {line}
                                  </span>
                                ))}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className={`form-card rv d${1 + shift}`}>
                      <div className="form-head">
                        {/* The case-study page heads this with an h2; home and about use an h3. */}
                        {block.formTitleTag === 'h3' ? (
                          <h3>{String(block.formTitle ?? config.title)}</h3>
                        ) : (
                          <h2 className="h2-sm">{String(block.formTitle ?? config.title)}</h2>
                        )}
                        {block.formNote ? <span>{String(block.formNote)}</span> : null}
                      </div>
                      <LeadForm config={config} />
                    </div>
                  </div>
                </div>
              </Section>
            );
          }

          default:
            return null;
        }
      })}
      <ScrollReveal />
    </>
  );
}
