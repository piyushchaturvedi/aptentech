'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route error boundary.
 *
 * Shows a plain recovery message. The underlying error is logged to the console for
 * developers and never rendered — an error page must not leak stack traces, API messages
 * or internal paths to a visitor.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Route error', error.digest ?? error.message);
  }, [error]);

  return (
    <main id="main" className="section" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <div className="wrap" style={{ textAlign: 'center', maxWidth: '52ch' }}>
        <span className="eyebrow" style={{ justifyContent: 'center' }}>Something went wrong</span>
        <h1 style={{ marginTop: 14 }}>We hit a problem loading this page</h1>
        <p className="lede" style={{ margin: '16px auto 28px' }}>
          This is on our side, not yours. Try again in a moment — if it keeps happening, please get in touch.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
          <Link href="/" className="btn btn-outline">Go to the homepage</Link>
        </div>
      </div>
    </main>
  );
}
