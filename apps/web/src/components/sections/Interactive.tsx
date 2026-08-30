'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CaseStudy, FeatureGroup, ProcessStep, ServiceItem, TechStackGroup, FaqItem } from '@aptentech/shared';
import { ACCENT_HEX } from '@aptentech/shared';
import { Icon, ArrowIcon, TickIcon, ChevronIcon } from '@/components/shared/Icon';

/**
 * Interactive sections.
 *
 * These are Client Components because they genuinely need state — tabs, an accordion, a
 * carousel. Crucially they are still server-rendered: Next.js emits their markup into the
 * HTML response, so the content is in the document for crawlers and readable without
 * JavaScript. That is the opposite of the source, where the same sections did not exist
 * until a script ran.
 *
 * The default open/selected item is index 0 in every case, matching the source, so the
 * server HTML and the first client render agree and nothing flashes.
 */

/* ------------------------------------------------------------------ services panel */

/** Source: `svcNav` + `svcDetail` — a tab rail with one shared detail panel. */
export function ServicesPanel({ items, label = 'Services' }: { items: ServiceItem[]; label?: string }) {
  const [active, setActive] = useState(0);
  if (!items.length) return null;

  const current = items[active] ?? items[0]!;

  return (
    <div className="svc-shell2">
      <div className="svc-nav" role="tablist" aria-label={label} id="svcNav">
        {items.map((item, index) => (
          <button
            key={`${item.title}-${index}`}
            className="svc-navi"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            style={{ ['--c' as string]: ACCENT_HEX[item.accent] }}
          >
            <span className="n">[{index + 1}]</span>
            <span className="t">{item.title}</span>
          </button>
        ))}
      </div>

      <div className="svc-detail" id="svcDetail" aria-live="polite" style={{ ['--c' as string]: ACCENT_HEX[current.accent] }}>
        <div className="ic" aria-hidden="true">
          <Icon name={current.icon} size={24} />
        </div>
        <h3>{current.title}</h3>
        <p>{current.description}</p>
        <ul className="svc-ul">
          {current.bullets.map((bullet) => (
            <li key={bullet}>
              <TickIcon />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <div className="svc-foot2">
          <a href="#contact" className="btn btn-mint btn-sm">
            Discuss this service
            <ArrowIcon />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ features */

const FEAT_VISIBLE = 9;

/** Service pages: a chip grid that reveals the rest behind a "Show more" toggle. */
export function FeatureChips({ items }: { items: FeatureGroup[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;

  return (
    <>
      <div className="feat-grid rv" id="featGrid">
        {items.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            className={`feat-item rv d${index % 3}${index >= FEAT_VISIBLE && !expanded ? ' is-hidden' : ''}`}
            style={{ ['--c' as string]: ACCENT_HEX[item.accent] }}
          >
            <span className="ic" aria-hidden="true">
              <Icon name={item.icon} size={19} />
            </span>
            <span>{item.title}</span>
          </div>
        ))}
      </div>

      {items.length > FEAT_VISIBLE ? (
        <div className="feat-toggle rv">
          <button
            type="button"
            className="feat-btn"
            id="featToggle"
            aria-expanded={expanded}
            aria-controls="featGrid"
            onClick={() => setExpanded((v) => !v)}
          >
            <span>{expanded ? 'Show less' : 'Show more'}</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Solution pages: a tab rail (`ftabs`) above one shared panel (`fpanel`).
 *
 * Not a grid of cards — the source renders one group at a time, selected from the rail, so
 * that is what this reproduces. Arrow keys move between tabs, matching the original.
 */
export function FeatureGroups({ items }: { items: FeatureGroup[] }) {
  const [active, setActive] = useState(0);
  if (!items.length) return null;

  const current = items[active] ?? items[0]!;

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next =
      event.key === 'ArrowRight' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    setActive(next);
    const rail = event.currentTarget.parentElement;
    (rail?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <>
      <div className="ftabs rv" role="tablist" aria-label="Feature panels" id="featTabs">
        {items.map((group, index) => (
          <button
            key={`${group.title}-${index}`}
            className="ftab"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            onKeyDown={(e) => onKeyDown(e, index)}
            style={{ ['--c' as string]: ACCENT_HEX[group.accent] }}
          >
            <span className="node" />
            {group.title}
          </button>
        ))}
      </div>

      <div
        className="fpanel rv d1"
        id="featPanel"
        aria-live="polite"
        style={{ ['--c' as string]: ACCENT_HEX[current.accent] }}
      >
        <div className="fpanel-head">
          <div className="ic" aria-hidden="true">
            <Icon name={current.icon} size={23} />
          </div>
          <h3>{current.title}</h3>
          <p>{current.description}</p>
        </div>
        <ul className="fgridlist">
          {current.items.map((item) => (
            <li key={item}>
              <TickIcon />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ process timeline */

export function ProcessTimeline({ steps }: { steps: ProcessStep[] }) {
  const [active, setActive] = useState(0);
  if (!steps.length) return null;

  const step = steps[active] ?? steps[0]!;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="tl rv" id="tl">
      <div className="tl-rail">
        <div className="tl-line" aria-hidden="true" />
        <div
          className="tl-fill"
          id="tlFill"
          aria-hidden="true"
          style={{ width: `${((active + 1) / steps.length) * 100}%` }}
        />
        <div className="tl-nodes" id="tlNodes" role="tablist" aria-label="Development stages">
        {steps.map((s, index) => (
          <button
            key={`${s.title}-${index}`}
            className="tl-node"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
          >
            <span className="dot">{pad(index + 1)}</span>
            <span className="lb">{s.title}</span>
          </button>
        ))}
        </div>
      </div>

      <div className="tl-panel" id="tlPanel" aria-live="polite">
        <div className="tl-inner">
          <div className="tl-big" aria-hidden="true">
            {pad(active + 1)}
          </div>
          <div>
            <p className="tl-step">
              Stage {pad(active + 1)} of {pad(steps.length)}
            </p>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <div className="tl-out">
              {step.deliverables.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tech stack */

export function TechStackTabs({ groups }: { groups: TechStackGroup[] }) {
  const [active, setActive] = useState(0);
  if (!groups.length) return null;

  const group = groups[active] ?? groups[0]!;

  return (
    <>
      <div className="tech-tabs rv" id="techTabs" role="tablist" aria-label="Technology categories">
        {groups.map((g, index) => (
          <button
            key={g.category}
            className="tech-tab"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            style={{ ['--c' as string]: ACCENT_HEX[g.accent] }}
          >
            {g.category}
          </button>
        ))}
      </div>

      <div className="tech-grid rv d1" id="techGrid">
        {group.items.map((name) => (
          <div key={name} className="tech" style={{ ['--c' as string]: ACCENT_HEX[group.accent] }}>
            <i aria-hidden="true">{name.slice(0, 2).toUpperCase()}</i>
            {name}
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ case carousel */

/**
 * The faux product screenshot behind each case study.
 *
 * The source built this in `shotHTML()`: a browser-chrome frame wrapping two of three
 * panels, picked by the case study's `shot` value, and each kind puts them in a different
 * order. Every class, element and bar height is the source's, because the stylesheet sizes
 * this entirely from them.
 */
const CHART_BARS = [42, 64, 51, 78, 60, 92, 70];

function ChartPanel() {
  return (
    <div className="ui-chart">
      {CHART_BARS.map((h, i) => (
        <i key={i} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function CellsPanel() {
  return (
    <div className="ui-cells">
      <div className="ui-cell" />
      <div className="ui-cell" />
    </div>
  );
}

function CodePanel({ console: c }: { console: CaseStudy['shotConsole'] | undefined }) {
  // A case study created in the CMS before this copy existed simply renders an empty frame.
  if (!c) return <div className="ui-code" />;
  return (
    <div className="ui-code">
      <b>$</b> {c.command}
      {c.checks.map((line) => (
        <span key={line}>
          <br />
          <em>&#10003;</em> {line}
        </span>
      ))}
      <br />
      <b>&rarr;</b> {c.summary}
    </div>
  );
}

function Shot({ cs }: { cs: CaseStudy }) {
  const panels =
    cs.shot === 'code' ? (
      <>
        <CodePanel console={cs.shotConsole} />
        <CellsPanel />
      </>
    ) : cs.shot === 'cells' ? (
      <>
        <CellsPanel />
        <ChartPanel />
      </>
    ) : (
      <>
        <ChartPanel />
        <CellsPanel />
      </>
    );

  return (
    <div className="ui">
      <div className="ui-top">
        <i />
        <i />
        <i />
        <b>aptentech / console</b>
      </div>
      <div className="ui-body">{panels}</div>
    </div>
  );
}

export function CaseCarousel({ items }: { items: CaseStudy[] }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  if (!items.length) return null;

  const go = (n: number) => setIndex(((n % items.length) + items.length) % items.length);

  return (
    <div
      className="cc"
      id="cc"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      {/*
        `cc-view` is where the stylesheet puts `overflow: hidden`. Using any other class
        name here lets the full track — eight slides side by side — size the page, which
        makes the whole document scroll horizontally.
      */}
      <div className="cc-view">
        <div
          className="cc-track"
          id="ccTrack"
          ref={trackRef}
          style={{ transform: `translate3d(-${index * 100}%,0,0)` }}
        >
          {items.map((cs) => (
            <div className="cc-slide" key={cs.id}>
              <article className="cs" style={{ ['--c' as string]: ACCENT_HEX[cs.accent] }}>
                <div className="cs-body">
                  <div className="cs-meta">
                    <span>{cs.industry}</span>
                    <span>{cs.techSummary}</span>
                    <span>{cs.tag}</span>
                  </div>
                  <h3>{cs.title}</h3>
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
                    {cs.metrics.map((m, i) => (
                      <div key={`${m.label}-${i}`}>
                        <b>{m.value}</b>
                        <em>{m.label}</em>
                      </div>
                    ))}
                  </div>
                  <Link href="/case-studies/" className="tlink">
                    Read the full case study
                    <ArrowIcon />
                  </Link>
                </div>
                <div className="cs-shot">
                  <Shot cs={cs} />
                  <p className="shot-tag">[PRODUCT INTERFACE MOCKUP]</p>
                </div>
              </article>
            </div>
          ))}
        </div>
      </div>

      {/* Class names and child order match the source's `.cc-nav` exactly. */}
      <div className="cc-nav">
        <button className="cc-btn" id="ccPrev" aria-label="Previous project" onClick={() => go(index - 1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="cc-btn" id="ccNext" aria-label="Next project" onClick={() => go(index + 1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="cc-dots" id="ccDots" role="tablist" aria-label="Choose project">
          {items.map((cs, i) => (
            <button
              key={cs.id}
              role="tab"
              aria-label={`Project ${i + 1}`}
              aria-selected={i === index}
              className={i === index ? 'on' : ''}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <span className="cc-count" id="ccCount">
          {String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ FAQ */

/**
 * FAQ accordion.
 *
 * Answers are in the server HTML whether or not a panel is open, so the visible content and
 * the FAQPage structured data always agree — the source generated both in the browser,
 * which made the schema unreliable for rich results.
 */
export function FaqAccordion({
  faqs,
  categories = false,
  wide = false,
}: {
  faqs: FaqItem[];
  categories?: boolean;
  /** Service and solution pages render the list full width as .faq-wide. */
  wide?: boolean;
}) {
  const groups = Array.from(new Set(faqs.map((f) => f.category).filter(Boolean))) as string[];
  const [activeCategory, setActiveCategory] = useState(groups[0] ?? '');
  const [open, setOpen] = useState<number | null>(null);

  const visible = categories && groups.length ? faqs.filter((f) => f.category === activeCategory) : faqs;

  return (
    <div className={categories && groups.length ? 'faq-shell' : ''}>
      {categories && groups.length ? (
        <div className="faq-side">
          <div className="faq-cats" id="faqCats" role="tablist" aria-label="FAQ categories">
            {groups.map((category) => (
              <button
                key={category}
                className="faq-cat"
                role="tab"
                aria-selected={category === activeCategory}
                onClick={() => {
                  setActiveCategory(category);
                  setOpen(null);
                }}
              >
                <span className="node" />
                {category}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={wide ? 'faq-wide rv d1' : 'faq-list'} id="faqList">
        {visible.map((faq, index) => {
          const isOpen = open === index;
          return (
            <div className={`faq-item${isOpen ? ' open' : ''}`} key={`${faq.question}-${index}`}>
              <button
                className="faq-q"
                aria-expanded={isOpen}
                aria-controls={`faq-${index}`}
                onClick={() => setOpen(isOpen ? null : index)}
              >
                {faq.question}
                <span className="chev" aria-hidden="true">
                  <ChevronIcon />
                </span>
              </button>
              <div
                className="faq-a"
                id={`faq-${index}`}
                role="region"
                style={{ height: isOpen ? 'auto' : 0, overflow: 'hidden' }}
              >
                <p>{faq.answer}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stat counters */

/**
 * Animated statistics.
 *
 * The final value is rendered on the server, so the numbers are correct in the HTML and
 * for anyone who never runs the animation. The count-up only replaces an already-correct
 * value, and is skipped entirely under `prefers-reduced-motion`.
 */
export function StatCounters({ stats }: { stats: Array<{ value: string; suffix: string; label: string }> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (animated || !ref.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const element = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        setAnimated(true);

        element.querySelectorAll<HTMLElement>('.num').forEach((node) => {
          const target = Number(node.dataset.count ?? '0');
          const suffix = node.dataset.suffix ?? '';
          const start = performance.now();

          const tick = (now: number) => {
            const p = Math.min((now - start) / 1300, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            node.textContent = `${Math.round(target * eased)}${suffix}`;
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.3 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [animated]);

  if (!stats.length) return null;

  return (
    <div className="stats" id="stats" ref={ref}>
      {stats.map((stat) => (
        <div className="stat" key={stat.label}>
          <div className="num" data-count={stat.value} data-suffix={stat.suffix}>
            {stat.value}
            {stat.suffix}
          </div>
          <div className="lab">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
