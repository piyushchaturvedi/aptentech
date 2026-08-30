import Link from 'next/link';
import type { SiteSettings } from '@aptentech/shared';
import { Icon } from '@/components/shared/Icon';

/**
 * Site footer.
 *
 * Fully server-rendered. The one piece of behaviour the original had — a script writing the
 * current year into `#yr` — is just computed here instead, so the footer needs no client
 * JavaScript at all.
 *
 * Contact details come from site settings and are shown exactly as stored. They are still
 * the source's `[EMAIL ADDRESS]` / `[PHONE NUMBER]` placeholders until AptenTech supplies
 * real values in the CMS; nothing is invented to fill the gap, and `renderContactHref`
 * makes sure a placeholder cannot become a broken `mailto:` a visitor could click.
 */

function isInternal(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (isInternal(href)) return <Link href={href}>{children}</Link>;
  return <a href={href}>{children}</a>;
}

/** A placeholder is rendered as plain text, never as a live link. */
function isPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}

const MailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
    <path d="m2.4 4.4 5.6 4 5.6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M3 3.5h2.6l1.1 2.7-1.4 1a7.6 7.6 0 0 0 3.5 3.5l1-1.4 2.7 1.1V13a1 1 0 0 1-1.1 1A10.4 10.4 0 0 1 2 4.6 1 1 0 0 1 3 3.5Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  const { email, phone } = settings;

  return (
    <footer className="footer">
      <div className="wrap">
        <div className="f-top">
          <div className="f-brand">
            <Link href="/" className="logo" aria-label={`${settings.companyName} home`}>
              <svg className="logo-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="#fff" />
                <path
                  d="M9 21.5 16 10l7 11.5"
                  stroke="#3A31DB"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="16" cy="23" r="2.4" fill="#00C9A7" />
              </svg>
              {settings.companyName}
            </Link>

            {settings.footerTagline ? <p>{settings.footerTagline}</p> : null}

            <div className="f-contact">
              {email ? (
                isPlaceholder(email) ? (
                  <span>
                    <MailIcon />
                    {email}
                  </span>
                ) : (
                  <a href={`mailto:${email}`}>
                    <MailIcon />
                    {email}
                  </a>
                )
              ) : null}

              {phone ? (
                isPlaceholder(phone) ? (
                  <span>
                    <PhoneIcon />
                    {phone}
                  </span>
                ) : (
                  <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                    <PhoneIcon />
                    {phone}
                  </a>
                )
              ) : null}
            </div>
          </div>

          {settings.footerColumns.map((column, index) => (
            <nav className="f-col" key={`${column.heading}-${index}`} aria-label={column.heading || 'Footer links'}>
              <p className="f-label">{column.heading}</p>
              <ul>
                {column.links.map((link) => (
                  <li key={`${link.label}-${link.href}`}>
                    <FooterLink href={link.href}>{link.label}</FooterLink>
                  </li>
                ))}
              </ul>

              {/* The source's Industries column carries a second labelled list in the same nav. */}
              {column.secondaryLinks?.length ? (
                <>
                  <p className="f-label" style={{ marginTop: 22 }}>
                    {column.secondaryHeading}
                  </p>
                  <ul>
                    {column.secondaryLinks.map((link) => (
                      <li key={`${link.label}-${link.href}`}>
                        <FooterLink href={link.href}>{link.label}</FooterLink>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </nav>
          ))}
        </div>

        <div className="f-mid">
          {settings.socials.length ? (
            <div className="socials">
              {settings.socials.map((social) =>
                // Until a real profile URL is set in the CMS the icon renders without an
                // href, so the row keeps its layout without offering a link to nowhere.
                social.href ? (
                  <a
                    key={social.label}
                    href={social.href}
                    aria-label={social.label}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name={social.icon} size={16} viewBox={"0 0 16 16"} fill="currentColor" />
                  </a>
                ) : (
                  <a key={social.label} aria-label={social.label}>
                    <Icon name={social.icon} size={16} viewBox={"0 0 16 16"} fill="currentColor" />
                  </a>
                ),
              )}
            </div>
          ) : null}

          {settings.footerCta ? (
            isInternal(settings.footerCta.href) ? (
              <Link href={settings.footerCta.href} className="btn btn-primary btn-sm">
                {settings.footerCta.label}
              </Link>
            ) : (
              <a href={settings.footerCta.href} className="btn btn-primary btn-sm">
                {settings.footerCta.label}
              </a>
            )
          ) : null}
        </div>

        <div className="f-bot">
          <p>
            © <span id="yr">{year}</span> {settings.companyName}. All rights reserved.
          </p>
          <nav aria-label="Legal">
            {settings.legalLinks.map((link) => (
              <FooterLink key={link.href} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
