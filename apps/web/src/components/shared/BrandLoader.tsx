/**
 * The loading state, in the shape of the logo.
 *
 * A server component with no state of its own: Next.js renders it from `loading.tsx` while
 * the route beside it is still being fetched, and removes it when that finishes. There is
 * nothing for it to decide, so there is no reason to ship JavaScript for it.
 *
 * The mark is the header's, traced rather than imported, because this one is animated and a
 * shared component would mean one file carrying two unrelated sets of requirements.
 */
export function BrandLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="brand-loader" role="status" aria-live="polite">
      <svg className="brand-loader__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#3A31DB" />
        <path
          className="brand-loader__stroke"
          d="M9 21.5 16 10l7 11.5"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="brand-loader__dot" cx="16" cy="23" r="2.4" fill="#00C9A7" />
      </svg>

      {/*
        The word is the accessible name, not decoration. A spinner alone announces nothing,
        so a screen reader reaching this region would be told only that it is a status.
      */}
      <span className="brand-loader__label">{label}</span>
    </div>
  );
}
