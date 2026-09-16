'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCENT_HEX } from '@aptentech/shared';
import type { AccentToken } from '@aptentech/shared';
import { Icon, ArrowIcon } from '@/components/shared/Icon';
import { inlineLinks } from '@/components/shared/InlineLinks';

/**
 * The growth-and-marketing band.
 *
 * A funnel on the left and a list of channels on the right. The list is taller than the funnel,
 * so on desktop it becomes a vertical slider sized to whatever the funnel happens to measure —
 * the two columns then end level regardless of how many stages or channels an editor enters.
 *
 * Below 900px the design drops the pager and shows every row, which is why the measuring code
 * returns early rather than computing a height nobody uses.
 */

export interface GrowthStage {
  number: string;
  title: string;
  description: string;
}

export interface GrowthChannel {
  accent: AccentToken;
  icon: string;
  title: string;
  description: string;
  outcome: string;
}

/** The pager chevrons, drawn exactly as the source does rather than by rotating the arrow. */
function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d={direction === 'left' ? 'M10 3.5 5 8l5 4.5' : 'M6 3.5 11 8l-5 4.5'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GrowthBand({
  eyebrow,
  title,
  lede,
  funnelLabel,
  ctaLabel,
  stages,
  channels,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  funnelLabel: string;
  ctaLabel: string;
  stages: GrowthStage[];
  channels: GrowthChannel[];
}) {
  const funnelRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState(0);
  /** The pixel offset each page scrolls to. One entry means the list fits and never scrolls. */
  const [offsets, setOffsets] = useState<number[]>([0]);
  const [viewHeight, setViewHeight] = useState<number | null>(null);

  /*
    Where each page of the channel list starts.

    Rows are not a uniform height — a two-line description and a three-line one differ by around
    24px — so a page cannot be "n rows of height h". Treating them as uniform is what left the
    last row sliced in half: the track was translated by a multiple of the *first* row's height,
    which by the bottom of the list had drifted well away from any real row boundary.

    Instead, walk the rows accumulating their real heights and start a new page whenever the next
    row would not fit whole. Each page then begins at an actual row's offset, so a row is either
    fully visible or not on that page at all.
  */
  const layout = useCallback(() => {
    const funnel = funnelRef.current;
    const track = trackRef.current;
    if (!funnel || !track) return;

    // Below 900px the design drops the pager and shows every row, so none of this applies.
    if (window.innerWidth <= 900) {
      setViewHeight(null);
      setOffsets([0]);
      return;
    }

    const rows = [...track.querySelectorAll<HTMLElement>('.gm-row')];
    if (!rows.length) return;

    const available = funnel.getBoundingClientRect().height;
    const heights = rows.map((row) => row.getBoundingClientRect().height);
    const total = heights.reduce((sum, h) => sum + h, 0);

    // The whole list already fits: no pager, no translation, and the column ends where the
    // content ends rather than being padded out to the funnel's height.
    if (total <= available) {
      setViewHeight(total);
      setOffsets([0]);
      setPage(0);
      return;
    }

    const starts: number[] = [];
    let offset = 0;
    let index = 0;

    while (index < rows.length) {
      starts.push(offset);

      let used = 0;
      // At least one row per page, even if a single row is taller than the funnel — otherwise
      // an unusually long description would loop forever.
      do {
        used += heights[index] ?? 0;
        index += 1;
      } while (index < rows.length && used + (heights[index] ?? 0) <= available);

      offset += used;
    }

    /*
      The final page is pulled back so it ends flush with the bottom of the list.

      Without this the last page starts at a row boundary and runs past the end, leaving blank
      space below the last row — and because the view is clipped, whatever sits at the boundary
      gets cut. Anchoring the last page to the end instead means the final rows are always whole.
    */
    if (starts.length > 1) {
      starts[starts.length - 1] = Math.max(0, total - available);
    }

    setViewHeight(available);
    setOffsets(starts);
    setPage((current) => Math.min(current, starts.length - 1));
  }, []);

  useEffect(() => {
    layout();

    // Debounced, because a drag-resize fires continuously and each pass reads layout back from
    // the browser, which forces a synchronous reflow every time.
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(layout, 150);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('load', layout);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('load', layout);
    };
  }, [layout]);

  if (!stages.length && !channels.length) return null;

  const pageCount = offsets.length;
  const scrollTo = offsets[Math.min(page, pageCount - 1)] ?? 0;

  return (
    <section className="section ai-sec on-dark" id="growth" aria-labelledby="growth-h2">
      <div className="wrap">
        <div className="sect-head">
          <div>
            {eyebrow ? <span className="eyebrow rv">{eyebrow}</span> : null}
            <h2 className="h2 rv d1" id="growth-h2">
              {title}
            </h2>
          </div>
          {lede ? (
            <p className="lede rv d2" style={{ color: '#A7AFD6' }}>
              {inlineLinks(lede)}
            </p>
          ) : null}
        </div>

        <div className="gm-shell">
          <div className="gm-funnel rv d2" ref={funnelRef}>
            {funnelLabel ? <p className="gm-k">{funnelLabel}</p> : null}

            <div className="gm-stages">
              {stages.map((stage, index) => (
                <div className="gm-stage" key={`${stage.title}-${index}`}>
                  {/* The accent is fixed in the design rather than per-stage: the funnel reads
                      as one object, and colouring each step differently breaks that. */}
                  <span className="dot" style={{ ['--c' as string]: '#5EF2D6' }}>
                    {stage.number}
                  </span>
                  <div className="body">
                    <b>{stage.title}</b>
                    <span>{inlineLinks(stage.description)}</span>
                  </div>
                </div>
              ))}
            </div>

            {ctaLabel ? (
              <a href="#contact" className="btn btn-mint gm-cta">
                {ctaLabel}
                <ArrowIcon size={15} />
              </a>
            ) : null}
          </div>

          <div className="gm-list-wrap rv d3">
            <div
              className="gm-list-view"
              ref={viewRef}
              {...(viewHeight ? { style: { height: viewHeight } } : {})}
            >
              <div
                className="gm-list"
                ref={trackRef}
                role="list"
                style={{ transform: `translateY(-${scrollTo}px)` }}
              >
                {channels.map((channel, index) => (
                  <div
                    className="gm-row"
                    role="listitem"
                    key={`${channel.title}-${index}`}
                    style={{ ['--c' as string]: ACCENT_HEX[channel.accent] }}
                  >
                    <span className="ic" aria-hidden="true">
                      <Icon name={channel.icon} size={19} />
                    </span>
                    <span className="tx">
                      <b>{channel.title}</b>
                      <span>{inlineLinks(channel.description)}</span>
                    </span>
                    <span className="out">{channel.outcome}</span>
                  </div>
                ))}
              </div>
            </div>

            {pageCount > 1 ? (
              <div className="gm-pager">
                <button
                  type="button"
                  className="gm-arrow"
                  aria-label="Previous channels"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <Chevron direction="left" />
                </button>

                <div className="gm-dots">
                  {Array.from({ length: pageCount }, (_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`Show channels page ${index + 1}`}
                      className={index === page ? 'is-active' : ''}
                      onClick={() => setPage(index)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="gm-arrow"
                  aria-label="More channels"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  <Chevron direction="right" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
