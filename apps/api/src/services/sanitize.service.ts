import sanitizeHtml from 'sanitize-html';

/**
 * HTML sanitisation for CMS rich text.
 *
 * Blog bodies are the one place an editor produces markup, so they are the one place
 * stored XSS could enter. The allowlist below is deliberately narrow and matches what the
 * approved design actually styles — an editor cannot introduce an element the stylesheet
 * has no rules for, which protects the layout as well as the security boundary.
 *
 * This runs on write *and* again on read. Sanitising on write alone assumes nothing ever
 * reaches the collection by another route (a restore, a migration, a direct edit), which
 * is not a safe assumption for content that ends up in `dangerouslySetInnerHTML`.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
    'code',
    'pre',
    'figure',
    'figcaption',
    'img',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'hr',
    'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    span: ['class'],
    code: ['class'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
  },
  // No `javascript:` or `data:` URIs. Relative paths stay allowed so `/images/...` and
  // internal links continue to work.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  // Class is allowed only on span/code, and only from a fixed set, so an editor cannot
  // attach arbitrary design classes and alter the layout.
  allowedClasses: {
    span: ['lede', 'muted', 'eyebrow'],
    code: ['inline'],
  },
  transformTags: {
    // Any link that leaves the site gets safe rel attributes automatically.
    a: (tagName, attribs) => {
      const href = attribs.href ?? '';
      const external = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: external
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
          : { ...attribs, rel: attribs.rel ?? '' },
      };
    },
  },
};

export function sanitizeRichText(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, RICH_TEXT_OPTIONS);
}

/**
 * Strips all markup. Used for JSON-LD values and meta descriptions, where markup would be
 * invalid rather than merely unwanted.
 */
export function toPlainText(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}
