import Link from 'next/link';
import type { CaseStudy } from '@aptentech/shared';
import { ACCENT_HEX } from '@aptentech/shared';
import { ArrowIcon } from '@/components/shared/Icon';
import { CaseShot } from './Interactive';

/**
 * The case-study page's own bands.
 *
 * The studies are listed at full width here rather than in the carousel the service pages
 * use: each is an `article.cs` with an `h2`, the problem/solution/result definition list,
 * the result figures and the faux interface shot. The source built this list in JavaScript
 * from a page-local array, so none of it was crawlable; it is server-rendered from the CMS
 * collection now, with the same markup.
 */

type Block = Record<string, unknown>;

const INDEX = '/case-studies/';

/**
 * Whether `/case-studies/<slug>/` has a page behind it.
 *
 * The source declared a detail URL for each of the eight portfolio studies and never
 * designed the page. Flip this to `true` when that route ships; every card then links to its
 * own study without another change.
 */
const CASE_STUDY_DETAIL_PAGES_EXIST = false;

export function PortfolioHero({ block }: { block: Block }) {
  const stats = (block.stats as Array<{ value: string; label: string }>) ?? [];

  return (
    <section className="pf-hero" aria-labelledby="page-h1">
      <div className="wrap">
        <nav className="crumb" aria-label="Breadcrumb" style={{ marginBottom: 14 }}>
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <span aria-current="page">{String(block.crumbLabel ?? '')}</span>
            </li>
          </ol>
        </nav>

        {block.eyebrow ? <span className="eyebrow rv">{String(block.eyebrow)}</span> : null}
        <h1 className="rv d1" id="page-h1">
          {String(block.title ?? '')}
        </h1>
        {block.lede ? <p className="pf-lede rv d2">{String(block.lede)}</p> : null}

        {stats.length ? (
          <div className="pf-stats rv d3">
            {stats.map((stat) => (
              <span key={stat.label}>
                <b>{stat.value}</b> {stat.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function CaseStudyList({ block, items }: { block: Block; items: CaseStudy[] }) {
  if (!items.length) return null;
  const ctaHref = String(block.ctaHref ?? '');
  const ctaLabel = String(block.ctaLabel ?? '');

  return (
    <section
      className="section"
      style={{ paddingBlock: 'clamp(40px,4.6vw,64px) clamp(44px,5vw,72px)' }}
      aria-labelledby="work-h2"
    >
      <div className="wrap">
        <h2 className="sr-only" id="work-h2">
          {String(block.title ?? 'Selected case studies')}
        </h2>

        <div className="pf-list" id="pfList">
          {items.map((cs, index) => (
            <article
              key={cs.id}
              className={`cs rv d${index % 3}`}
              style={{ ['--c' as string]: ACCENT_HEX[cs.accent] }}
            >
              <div className="cs-body">
                <div className="cs-meta">
                  <span>{cs.industry}</span>
                  <span>{cs.techSummary}</span>
                  <span>{cs.tag}</span>
                </div>
                {/* An h2 here, not the carousel's h3: each study is a top-level item on this page. */}
                <h2 className="h2-sm">{cs.title}</h2>
                <dl className="cs-dl">
                  <div>
                    <dt>Problem</dt>
                    <dd>{cs.problem}</dd>
                  </div>
                  <div>
                    <dt>Solution</dt>
                    <dd>{cs.solution}</dd>
                  </div>
                  <div>
                    <dt>Result</dt>
                    <dd>{cs.result}</dd>
                  </div>
                </dl>
                <div className="cs-res">
                  {cs.metrics.map((metric, i) => (
                    <div key={`${metric.label}-${i}`}>
                      <b>{metric.value}</b>
                      <em>{metric.label}</em>
                    </div>
                  ))}
                </div>
                {/*
                  Each study still carries the detail URL the source declared, so the day
                  those pages are designed the link lights up on its own. Until then it goes
                  to the index rather than relying on a redirect to cover a dead link.
                */}
                <Link href={CASE_STUDY_DETAIL_PAGES_EXIST ? cs.detailHref || INDEX : INDEX} className="tlink">
                  Read the full case study
                  <ArrowIcon />
                </Link>
              </div>
              <div className="cs-shot">
                <CaseShot cs={cs} />
                {cs.shotCaption ? <p className="shot-tag">{cs.shotCaption}</p> : null}
              </div>
            </article>
          ))}
        </div>

        {ctaLabel ? (
          <div className="pf-cta rv">
            <Link href={ctaHref || '/case-studies/'} className="btn btn-primary btn-lg">
              {ctaLabel}
              <ArrowIcon size={17} />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
