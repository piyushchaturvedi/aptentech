import Link from 'next/link';
import { ACCENT_HEX, type SiteSettings } from '@aptentech/shared';
import { ChevronIcon } from '@/components/shared/Icon';
import { HeaderInteractions } from './HeaderInteractions';

/**
 * Site header.
 *
 * A Server Component: the mega-menu is real markup in the HTML response, so it is
 * crawlable and needs no JavaScript to exist. Only the burger toggle, scrolled state and
 * mobile accordion are interactive, and those live in a small sibling client component
 * rather than turning the whole header into one.
 *
 * Class names and element structure are copied from the source markup, because the
 * stylesheet is carried over verbatim and keys off exactly these.
 */

/** The `.mcols` modifier is derived from the column count, matching the source's c2/c4. */
function mcolsClass(columnCount: number, hasPromo: boolean): string {
  const total = columnCount + (hasPromo ? 1 : 0);
  return total >= 4 ? 'mcols c4' : 'mcols c2';
}

function isInternal(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

/** The mega-menu promo button. The source puts the button classes on the anchor itself. */
function PromoCta({ href, label }: { href: string; label: string }) {
  if (isInternal(href)) {
    return (
      <Link href={href} className="btn btn-primary btn-sm">
        {label}
      </Link>
    );
  }
  return (
    <a href={href} className="btn btn-primary btn-sm">
      {label}
    </a>
  );
}

/** A direct entry in the mobile menu: `a.top`, matching the source. */
function MobileTopLink({ href, label }: { href: string; label: string }) {
  if (isInternal(href)) {
    return (
      <Link href={href} className="top">
        {label}
      </Link>
    );
  }
  return (
    <a href={href} className="top">
      {label}
    </a>
  );
}

/** Uses `next/link` for internal routes so navigation is client-side and instant. */
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (isInternal(href)) return <Link href={href}>{children}</Link>;
  return <a href={href}>{children}</a>;
}

export function SiteHeader({ settings }: { settings: SiteSettings }) {
  const nav = settings.navigation ?? [];
  const mobileNav = settings.mobileNavigation ?? [];
  const mobileCta = settings.mobileNavCta;
  const cta = settings.headerCta;

  return (
    <header className="header" id="header">
      <div className="wrap header-inner">
        <Link href="/" className="logo" aria-label={`${settings.companyName} home`}>
          <svg className="logo-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#3A31DB" />
            <path
              d="M9 21.5 16 10l7 11.5"
              stroke="#fff"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="16" cy="23" r="2.4" fill="#00C9A7" />
          </svg>
          {settings.companyName}
        </Link>

        <ul className="nav" role="list">
          {nav.map((group) => {
            const hasPanel = group.columns.length > 0;

            if (!hasPanel) {
              return (
                <li key={group.label}>
                  <NavLink href={group.href}>{group.label}</NavLink>
                </li>
              );
            }

            const hasPromo = Boolean(group.promoTitle);

            return (
              <li key={group.label}>
                <button aria-expanded="false">
                  {group.label} <ChevronIcon size={11} />
                </button>
                <div className={group.alignRight ? 'mega right' : 'mega'}>
                  <div className={mcolsClass(group.columns.length, hasPromo)}>
                    {group.columns.map((column, index) => (
                      <div key={`${group.label}-${column.heading || index}`}>
                        {column.heading ? (
                          <p className="mega-label">
                            <i style={{ background: ACCENT_HEX[column.accent] }} />
                            {column.heading}
                          </p>
                        ) : null}
                        <ul>
                          {column.links.map((link) => (
                            <li key={`${link.label}-${link.href}`}>
                              <NavLink href={link.href}>{link.label}</NavLink>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {hasPromo ? (
                      <div className="mpromo">
                        <div>
                          <b>{group.promoTitle}</b>
                          <span>{group.promoBody}</span>
                        </div>
                        {group.promoCta ? (
                          <PromoCta href={group.promoCta.href} label={group.promoCta.label} />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {cta ? (
          isInternal(cta.href) ? (
            <Link href={cta.href} className="btn btn-primary btn-sm header-cta">
              {cta.label}
            </Link>
          ) : (
            <a href={cta.href} className="btn btn-primary btn-sm header-cta">
              {cta.label}
            </a>
          )
        ) : null}

        <button className="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="mnav">
          <i />
        </button>
      </div>

      {/*
        The mobile menu is its own list in the source — two expandable groups and five
        direct links — rather than a projection of the desktop mega-menu, so it renders
        from its own settings entry and matches the original element for element.
      */}
      <nav className="mnav" id="mnav" aria-label="Mobile">
        <ul>
          {mobileNav.map((item) =>
            item.links.length ? (
              <li key={`m-${item.label}`}>
                <button className="top" aria-expanded="false">
                  {item.label} <ChevronIcon size={14} />
                </button>
                <div className="sub">
                  {item.links.map((link) => (
                    <NavLink key={`m-${link.label}-${link.href}`} href={link.href}>
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </li>
            ) : (
              <li key={`m-${item.label}`}>
                <MobileTopLink href={item.href} label={item.label} />
              </li>
            ),
          )}

          {mobileCta ? (
            <li style={{ border: 0 }}>
              {isInternal(mobileCta.href) ? (
                <Link href={mobileCta.href} className="btn btn-primary">
                  {mobileCta.label}
                </Link>
              ) : (
                <a href={mobileCta.href} className="btn btn-primary">
                  {mobileCta.label}
                </a>
              )}
            </li>
          ) : null}
        </ul>
      </nav>

      <HeaderInteractions />
    </header>
  );
}
