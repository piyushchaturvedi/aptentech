import type { Metadata } from 'next';
import Link from 'next/link';
import '@/styles/site.css';

/**
 * Thank you — `/thank-you/`
 *
 * The source site had no such page: every form showed an inline message and stayed put. This
 * one is assembled entirely from classes `site.css` already defines — `.section`, `.wrap`,
 * `.eyebrow`, `.h2`, `.lede`, `.btn` — so it inherits the approved design rather than
 * introducing anything new, and it invents no company detail.
 *
 * It is deliberately static. The confirmation must render for a visitor who arrives with no
 * session, no query string and no JavaScript, and it must never depend on the lead record —
 * reading one here would expose an enquiry to anyone who guessed a URL.
 */

export const metadata: Metadata = {
  title: 'Thank you — AptenTech',
  description: 'Your enquiry has reached us. A senior engineer will reply within one business day.',
  alternates: { canonical: '/thank-you/' },
  // A confirmation page has no search value and would only ever be reached by mistake.
  robots: { index: false, follow: true },
};

export default function ThankYouPage() {
  return (
    <section className="section">
      <div className="wrap center" style={{ maxWidth: '58ch', textAlign: 'center' }}>
        <span className="eyebrow" style={{ justifyContent: 'center' }}>
          Enquiry received
        </span>

        <h1 className="h2" style={{ marginTop: 14 }}>
          Thank you — your message is with us
        </h1>

        <p className="lede" style={{ margin: '16px auto 10px' }}>
          A senior engineer will read your enquiry personally and reply within one business day.
          A confirmation is on its way to your inbox.
        </p>

        <p className="lede" style={{ margin: '0 auto 28px' }}>
          You can reply to that email directly — it reaches the same conversation, so nothing
          gets lost between messages.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-primary">
            Back to the homepage
          </Link>
          <Link href="/case-studies/" className="btn btn-outline">
            See our work
          </Link>
          <Link href="/blog/" className="btn btn-outline">
            Read our insights
          </Link>
        </div>
      </div>
    </section>
  );
}
