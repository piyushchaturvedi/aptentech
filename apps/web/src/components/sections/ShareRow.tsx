'use client';

import { useState } from 'react';

/**
 * The article's share row.
 *
 * The source drew three icons with `href="#"` — the markup was there, the behaviour was
 * not, and a link to `#` is a link that goes nowhere. LinkedIn and X now carry real share
 * URLs, so they work with JavaScript off and a crawler sees ordinary outbound links. The
 * third copies the article's address to the clipboard, which is what its icon has always
 * depicted; it carries no `href` at all rather than a fake one.
 *
 * The URL is passed in from the server so it is absolute and correct in the markup, rather
 * than read from the address bar after hydration.
 */
export function ShareRow({ label, title, url }: { label: string; title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that refuses clipboard access leaves the label unchanged; there is nothing
      // useful to tell the reader and nothing broken to report.
    }
  };

  return (
    <div className="share">
      <span className="k">{label}</span>

      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on LinkedIn"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.4 5.5h2.2V13H3.4V5.5Zm1.1-3.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM7.2 5.5h2.1v1h.03c.3-.55 1-1.13 2.07-1.13 2.2 0 2.6 1.45 2.6 3.34V13h-2.2V9.15c0-.92-.02-2.1-1.28-2.1-1.28 0-1.48 1-1.48 2.03V13H7.2V5.5Z" />
        </svg>
      </a>

      <a
        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M12.1 2h2.1L9.6 7.2 15 14h-4.2l-3.3-4.3L3.7 14H1.6l4.9-5.6L1.3 2h4.3l3 4 3.5-4Zm-.7 10.7h1.15L4.65 3.23H3.4l8 9.47Z" />
        </svg>
      </a>

      {/* No href: this is a control, and a link to `#` is a link that goes nowhere. */}
      <a role="button" tabIndex={0} aria-label={copied ? 'Link copied' : 'Copy link'} onClick={() => void copy()}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6.5 9.5a2.5 2.5 0 0 0 3.6 0l2-2a2.5 2.5 0 0 0-3.5-3.6l-.6.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M9.5 6.5a2.5 2.5 0 0 0-3.6 0l-2 2a2.5 2.5 0 0 0 3.5 3.6l.6-.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </a>
    </div>
  );
}
