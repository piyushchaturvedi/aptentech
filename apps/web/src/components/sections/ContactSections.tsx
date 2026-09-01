import Link from 'next/link';
import type { LeadFormConfig } from '@aptentech/shared';
import { ACCENT_HEX } from '@aptentech/shared';
import { Icon, ArrowIcon } from '@/components/shared/Icon';
import { LeadForm } from '@/components/forms/LeadForm';

/**
 * The contact page's four bands.
 *
 * This page is its own design rather than an instance of the service-page template: the
 * heading sits inside the lead layout beside the form, the follow-up steps are numbered
 * cards, and the routes and offices are card grids the other pages do not have. The markup
 * below mirrors the source band for band so the stylesheet carried over renders it
 * unchanged, while every string comes from the CMS.
 */

type Block = Record<string, unknown>;

const accentStyle = (accent: unknown) => ({ ['--c' as string]: ACCENT_HEX[accent as keyof typeof ACCENT_HEX] });

/** Reveal delay classes: the first card has none, the rest step d1…d3, as in the source. */
const reveal = (index: number, base = 'rv') => (index ? `${base} d${index}` : base);

function SectionHead({ title, lede, headingId }: { title: string; lede?: string; headingId: string }) {
  if (!title) return null;
  return (
    <div className="sect-head">
      <h2 className="h2 rv" id={headingId}>
        {title}
      </h2>
      {lede ? <p className="lede rv d1">{lede}</p> : null}
    </div>
  );
}

export function ContactBanner({ block }: { block: Block }) {
  const reasons = (block.reasons as Array<Record<string, string>>) ?? [];
  const offices = (block.offices as Array<{ label: string; lines: string[] }>) ?? [];
  const config = block.leadForm as LeadFormConfig | undefined;

  return (
    <section className="section canvas lead-banner" id="contact" aria-labelledby="lead-h2">
      <div className="wrap">
        <nav className="crumb" aria-label="Breadcrumb" style={{ marginBottom: 20 }}>
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <span aria-current="page">{String(block.crumbLabel ?? '')}</span>
            </li>
          </ol>
        </nav>

        <div className="lead">
          <div className="lead-copy">
            {/* The page's h1 lives here, not in a hero above — as in the source. */}
            <h1 className="rv" id="lead-h2">
              {String(block.heading ?? '')}
            </h1>
            {block.lede ? (
              <p className="lede rv d1" style={{ marginTop: 16 }}>
                {String(block.lede)}
              </p>
            ) : null}

            {reasons.length ? (
              <div className="reasons rv d2">
                {reasons.map((reason, index) => (
                  <div key={`${reason.title}-${index}`} className="reason" style={accentStyle(reason.accent)}>
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
              <div className="offices rv d3">
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

          <div className="form-card rv d1">
            <div className="form-head form-head-stack">
              <h2 className="h2-sm">{String(block.formTitle ?? '')}</h2>
              {block.formSubtitle ? (
                <p className="form-sub">
                  <span className="dot" aria-hidden="true" />
                  {String(block.formSubtitle)}
                </p>
              ) : null}
            </div>
            {config ? <LeadForm config={config} variant="contact" /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function StepGrid({ block }: { block: Block }) {
  const steps = (block.stepCards as Array<Record<string, string>>) ?? [];
  if (!steps.length) return null;

  return (
    <section className="section" id="next" aria-labelledby="next-h2">
      <div className="wrap">
        <SectionHead title={String(block.title ?? '')} lede={String(block.lede ?? '')} headingId="next-h2" />
        <div className="next-grid">
          {steps.map((step, index) => (
            <article key={step.title} className={`next ${reveal(index)}`} style={accentStyle(step.accent)}>
              <span className="n">{step.number}</span>
              <h3 className="h3-card">{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RouteGrid({ block }: { block: Block }) {
  const routes = (block.routes as Array<Record<string, string>>) ?? [];
  if (!routes.length) return null;

  return (
    <section className="section canvas" id="routes" aria-labelledby="route-h2">
      <div className="wrap">
        <SectionHead title={String(block.title ?? '')} lede={String(block.lede ?? '')} headingId="route-h2" />
        <div className="route-grid">
          {routes.map((route, index) => (
            <article key={route.title} className={`route ${reveal(index)}`} style={accentStyle(route.accent)}>
              <div className="ic" aria-hidden="true">
                <Icon name={route.icon ?? ''} size={20} />
              </div>
              <h3 className="h3-card">{route.title}</h3>
              <p>{route.description}</p>
              {/*
                Addresses are still the source's `[SALES EMAIL]` placeholders. A placeholder
                is shown as plain text rather than a `mailto:` a visitor could click into a
                dead compose window; setting a real address in the CMS makes it a link.
              */}
              {route.linkLabel ? (
                // The anchor stays an anchor so the card keeps its styling; a placeholder
                // simply has no target, rather than a mailto: that opens an empty draft.
                <a {...(isPlaceholder(route.href ?? '') ? {} : { href: route.href })}>{route.linkLabel}</a>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OfficeCards({ block }: { block: Block }) {
  const cards = (block.cards as Array<Record<string, unknown>>) ?? [];
  if (!cards.length) return null;

  return (
    <section className="section" id="offices" aria-labelledby="off-h2">
      <div className="wrap">
        <SectionHead title={String(block.title ?? '')} lede={String(block.lede ?? '')} headingId="off-h2" />
        <div className="off-grid">
          {cards.map((card, index) => {
            const lines = (card.addressLines as string[]) ?? [];
            const phoneHref = String(card.phoneHref ?? '');
            const phoneLabel = String(card.phoneLabel ?? '');

            return (
              <article key={`${String(card.city)}-${index}`} className={`off ${reveal(index)}`} style={accentStyle(card.accent)}>
                <div className="flagline">
                  <span className="dot" aria-hidden="true" />
                  <span className="k">{String(card.kind ?? '')}</span>
                </div>
                <h3 className="h3-card">{String(card.city ?? '')}</h3>
                <address>
                  {lines.map((line, i) => (
                    <span key={line}>
                      {i ? <br /> : null}
                      {line}
                    </span>
                  ))}
                </address>
                {phoneLabel ? (
                  <a {...(isPlaceholder(phoneHref) ? {} : { href: phoneHref })}>{phoneLabel}</a>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** `[SALES EMAIL]`, `tel:[PHONE]` and the like: real text, but not a usable target. */
function isPlaceholder(value: string): boolean {
  return /\[[^\]]+\]/.test(value);
}

export { ArrowIcon };
