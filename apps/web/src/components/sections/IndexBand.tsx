import Link from 'next/link';
import { ACCENT_HEX, type AccentToken } from '@aptentech/shared';
import type { ServiceSummary } from '@/lib/api/content';
import { ArrowIcon } from '@/components/shared/Icon';

/**
 * An index of the pages that live under one section of the site.
 *
 * The source's mega-menu pointed 39 entries at four paths that had no page behind them —
 * `/services/`, `/solutions/`, `/technologies/` and `/case-studies/`. Sending them all to a
 * redirect resolved without a 404 but read as broken: clicking any of the eighteen entries
 * under "Services" left you on the page you started from.
 *
 * This gives them somewhere real to land, and is assembled entirely from parts the approved
 * design already has — the breadcrumb, the `.sect-head` heading block, the `.bento` card grid
 * the solutions band uses, and the `.tlink` arrow link, all defined in `site.css`. No new
 * visual language, and every card's title and description is that page's own hero copy rather
 * than anything written for the index.
 */

/** The design's six accents, cycled so a grid of any length stays on-palette. */
const ACCENTS: AccentToken[] = ['indigo', 'mint', 'violet', 'amber', 'cyan', 'pink'];

export function IndexBand({
  crumbLabel,
  eyebrow,
  title,
  lede,
  items,
  prefix,
  linkPrefix = 'Explore',
}: {
  crumbLabel: string;
  eyebrow?: string;
  title: string;
  lede?: string;
  items: ServiceSummary[];
  /** `/services/` or `/solutions/` — each card links to `<prefix><slug>/`. */
  prefix: string;
  linkPrefix?: string;
}) {
  return (
    <section className="section" aria-labelledby="page-h1">
      <div className="wrap">
        <nav className="crumb" aria-label="Breadcrumb" style={{ marginBottom: 20 }}>
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <span aria-current="page">{crumbLabel}</span>
            </li>
          </ol>
        </nav>

        <div className="sect-head">
          <div>
            {eyebrow ? <span className="eyebrow rv">{eyebrow}</span> : null}
            {/* An h1 wearing the h2 type scale: this is the page's only top-level heading. */}
            <h1 className={`h2 rv${eyebrow ? ' d1' : ''}`} id="page-h1">
              {title}
            </h1>
          </div>
          {lede ? <p className={`lede rv d${eyebrow ? 2 : 1}`}>{lede}</p> : null}
        </div>

        <div className="bento">
          {items.map((item, index) => (
            <article
              key={item.id}
              className={`rv d${index % 3}`}
              style={{ ['--c' as string]: ACCENT_HEX[ACCENTS[index % ACCENTS.length]!] }}
            >
              <h3 className="h3-card">{item.name}</h3>
              <p>{item.heroDescription}</p>
              <Link href={`${prefix}${item.slug}/`} className="tlink" style={{ marginTop: 18 }}>
                {linkPrefix} {item.name}
                <ArrowIcon />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
