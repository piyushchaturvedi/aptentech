import Link from 'next/link';
import '@/styles/site.css';

/** 404. Uses the approved design tokens; no internal detail is exposed. */
export default function NotFound() {
  return (
    <main id="main" className="section" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <div className="wrap" style={{ textAlign: 'center', maxWidth: '52ch' }}>
        <span className="eyebrow" style={{ justifyContent: 'center' }}>Error 404</span>
        <h1 style={{ marginTop: 14 }}>We could not find that page</h1>
        <p className="lede" style={{ margin: '16px auto 28px' }}>
          The link may be out of date, or the page may have moved. The pages below are a good place to pick up.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-primary">Go to the homepage</Link>
          <Link href="/case-studies/" className="btn btn-outline">See our work</Link>
          <Link href="/contact/" className="btn btn-outline">Contact us</Link>
        </div>
      </div>
    </main>
  );
}
