/**
 * Opens an item's live page from an admin list, in a new tab.
 *
 * Rendered only for published items, matching what the blog list already did. A draft's public
 * URL answers 404, so a View button on it would open something that looks broken; the row's
 * status chip already says why there is nothing to view, and the button appearing the moment
 * the item is published is its own confirmation that it went live.
 *
 * A new tab, because the list is where the editor is working — opening the page in place would
 * lose their scroll position and any filter they had applied. `noopener` so the opened page
 * cannot reach back into the admin through `window.opener`.
 */
// `status` is a plain string because the lists that use this type it differently — the service
// list carries the API's string, the collections the narrower PublishStatus. All that matters
// here is whether it is published.
export function ViewLink({ href, status }: { href: string | null | undefined; status: string }) {
  if (status !== 'PUBLISHED' || !href) return null;

  return (
    <a className="adm-btn ghost sm" href={href} target="_blank" rel="noopener noreferrer">
      View ↗
    </a>
  );
}
