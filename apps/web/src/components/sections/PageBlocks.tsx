import Link from 'next/link';
import type { PageBlock, SiteSettings, LeadFormConfig } from '@aptentech/shared';
import type { ResolvedSitePage } from '@/lib/api/content';
import { Media } from '@/components/shared/Media';
import { LeadForm } from '@/components/forms/LeadForm';
import { ArrowIcon } from '@/components/shared/Icon';
import {
  ComplianceBadges,
  Section,
  SectionHead,
  SolutionsBento,
  TechnologyGrid,
  TestimonialGrid,
} from './ServerSections';
import { CaseCarousel, FaqAccordion, ProcessTimeline, ServicesPanel, StatCounters } from './Interactive';
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
              <Section key={key} id="compliance">
                <div className="wrap">
                  <SectionHead title={block.title ?? ''} headingId="comp-h2" center />
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
                  <SectionHead title={block.title ?? ''} lede={block.body} headingId="tst-h2" center />
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

          case 'ctaSection':
            return (
              <section key={key} className="section">
                <div className="wrap">
                  <div className="strip rv">
                    <div className="strip-in">
                      <div>
                        <h2 className="h2-sm">{block.title}</h2>
                        {block.body ? <p>{block.body}</p> : null}
                        <CtaList ctas={block.ctas} className="" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );

          case 'leadFormSection': {
            const config: LeadFormConfig = {
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

            return (
              <Section key={key} id="contact" labelledBy="lead-h2">
                <div className="wrap">
                  <div className="lead">
                    <div className="lead-copy">
                      <h2 className="h2" id="lead-h2">
                        {block.title}
                      </h2>
                      {block.body ? <p className="lede">{block.body}</p> : null}
                    </div>
                    <div className="form-card">
                      <div className="form-head">
                        {/* h2.h2-sm here, matching the source; service pages use an h3. */}
                        <h2 className="h2-sm">{config.title}</h2>
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
