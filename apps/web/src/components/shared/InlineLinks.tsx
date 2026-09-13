import { Fragment } from 'react';
import Link from 'next/link';

/**
 * Links inside body copy.
 *
 * Editors need to turn a phrase into a link — "we approach [legacy application
 * modernization](/services/modernization/) in phases" — and the CMS deliberately does not
 * accept HTML in these fields. Free-form markup in a body string is a stored-XSS sink and
 * would also let an editor introduce elements the design has no rules for, which is the one
 * thing the design lock exists to prevent.
 *
 * So the field stays plain text and carries a single, closed piece of notation:
 *
 *     [anchor text](/where/it/goes/)
 *
 * Nothing here is ever passed to `dangerouslySetInnerHTML`. The anchor is constructed by this
 * component from two captured strings, so the worst an editor can produce is a link with odd
 * words in it — not markup, not an attribute, not a script.
 *
 * Unrecognised text is returned unchanged, so every existing string renders exactly as it did
 * before and a stray bracket in ordinary prose is left alone rather than eaten.
 */

/**
 * Schemes a link may use.
 *
 * `javascript:` and `data:` are the two that turn a link into code execution, and an allowlist
 * is the only reliable way to exclude them — blocklists lose to `java\tscript:` and friends.
 * A link that fails this renders as plain text, which is visible to whoever wrote it and
 * harmless to everyone else.
 */
function isSafeHref(href: string): boolean {
  if (href.startsWith('/') || href.startsWith('#')) return true;
  return /^(https?:|mailto:|tel:)/i.test(href);
}

const PATTERN = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/*
  Underlined in the surrounding text colour, rather than blue.

  Body copy on this site runs on white, on tinted panels and on saturated blue cards, and a
  fixed link colour cannot stay legible across all three — on the blue cards a blue link
  disappears into the background. Inheriting the colour and marking the link with an underline
  reads as a link on every one of them.

  Styled inline because the rule would otherwise have to be added to eight per-page stylesheets
  that each carry their own copy of the base design.
*/
const LINK_STYLE = { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' } as const;

export function inlineLinks(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  if (!text.includes('](')) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  PATTERN.lastIndex = 0;
  while ((match = PATTERN.exec(text)) !== null) {
    const [whole, label, href] = match;
    if (!label || !href) continue;

    if (match.index > cursor) parts.push(text.slice(cursor, match.index));

    if (!isSafeHref(href)) {
      // Keep the words, drop the link. Silently removing the text would look like data loss.
      parts.push(label);
    } else if (href.startsWith('/')) {
      // Internal links go through next/link so they prefetch and navigate client-side, the
      // same as every other internal link on the site.
      parts.push(
        <Link key={`${match.index}-${href}`} href={href} style={LINK_STYLE}>
          {label}
        </Link>,
      );
    } else {
      const external = /^https?:/i.test(href);
      parts.push(
        <a
          key={`${match.index}-${href}`}
          href={href}
          style={LINK_STYLE}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {label}
        </a>,
      );
    }

    cursor = match.index + whole.length;
  }

  if (cursor === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));

  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}

/**
 * Convenience wrapper for the common case of a whole paragraph.
 *
 * Renders nothing at all when the text is empty, so a call site can drop this in where it
 * previously printed a string without adding its own guard.
 */
export function InlineText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <>{inlineLinks(text)}</>;
}
