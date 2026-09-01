import sanitizeHtml from 'sanitize-html';
import { env } from '../config/env';

/**
 * The site's own host.
 *
 * Absolute links to it — which the legal documents use — are internal, so they must not
 * pick up `target="_blank"` or `rel="nofollow"`.
 */
const SELF_HOST = new URL(env.PUBLIC_SITE_URL).host.replace(/^www\./, '');

function isExternal(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).host.replace(/^www\./, '') !== SELF_HOST;
  } catch {
    return true;
  }
}

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
      const external = isExternal(href);
      return {
        tagName,
        attribs: external
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
          : { ...attribs, rel: attribs.rel ?? '' },
      };
    },
  },
};

/**
 * The legal documents are structured, not free prose: numbered clauses in their own
 * `<section id="sN">`, definition cards, and key labels the stylesheet targets by class.
 * Stripping those, as the generic rich-text profile does, would take the document's
 * structure with them — so this profile keeps exactly those elements and nothing more.
 */
const LEGAL_OPTIONS: sanitizeHtml.IOptions = {
  ...RICH_TEXT_OPTIONS,
  allowedTags: [...(RICH_TEXT_OPTIONS.allowedTags as string[]), 'section', 'div'],
  allowedAttributes: {
    ...RICH_TEXT_OPTIONS.allowedAttributes,
    section: ['id'],
    div: ['class'],
    // `style` is admitted only so `allowedStyles` below can filter it; every property but
    // the one listed there is dropped.
    p: ['class', 'style'],
  },
  allowedClasses: {
    span: ['n'],
    div: ['legal-card', 'legal-note'],
    p: ['k'],
    code: ['inline'],
  },
  /*
    The definition cards space their labels with an inline `margin-top`. Stripping it closed
    the gap above three labels and made the section 24px shorter than the original, so one
    property is allowed through — bounded to a small pixel value, which is a spacing tweak
    and not a route to restyling the page.
  */
  allowedStyles: {
    p: { 'margin-top': [/^\d{1,2}px$/] },
  },
};

/**
 * Article bodies.
 *
 * The blog template styles more than prose: key-takeaway panels, scrollable table wrappers,
 * pull quotes, inline calls to action, figures and anchored sections that the contents list
 * links to. The generic rich-text profile strips all of them, so an editor writing the
 * article the design was built for would have watched it collapse into plain paragraphs.
 */
const ARTICLE_OPTIONS: sanitizeHtml.IOptions = {
  ...RICH_TEXT_OPTIONS,
  allowedTags: [...(RICH_TEXT_OPTIONS.allowedTags as string[]), 'section', 'div', 'caption', 'time'],
  allowedAttributes: {
    ...RICH_TEXT_OPTIONS.allowedAttributes,
    section: ['id'],
    div: ['class'],
    p: ['class'],
    h2: ['id'],
    h3: ['id'],
    blockquote: ['class'],
    caption: ['class'],
    time: ['datetime'],
  },
  allowedClasses: {
    span: ['lede', 'muted', 'eyebrow', 'k'],
    div: ['takeaway', 'tbl-wrap', 'inline-cta', 'fig-frame'],
    p: ['k'],
    blockquote: ['pullquote'],
    caption: ['sr-only'],
    code: ['inline'],
  },
};

export function sanitizeArticleHtml(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, ARTICLE_OPTIONS);
}

export function sanitizeLegalHtml(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, LEGAL_OPTIONS);
}

export function sanitizeRichText(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, RICH_TEXT_OPTIONS);
}

/**
 * Sanitises the markup a page's blocks carry.
 *
 * Three block types hold HTML: `richText` and `legalSection` use the rich-text profile,
 * and `legalDocument` uses the structural one, which additionally keeps clause sections,
 * definition cards and the numbering spans. Everything else is left untouched.
 */
export function sanitizePageBlocks<T extends { blocks?: unknown }>(page: T): T {
  const blocks = page.blocks;
  if (!Array.isArray(blocks)) return page;

  return {
    ...page,
    blocks: blocks.map((raw) => {
      const block = raw as Record<string, unknown>;
      if (block.type === 'legalDocument') {
        return {
          ...block,
          notice: sanitizeLegalHtml(String(block.notice ?? '')),
          bodyHtml: sanitizeLegalHtml(String(block.bodyHtml ?? '')),
        };
      }
      if (block.type === 'richText' || block.type === 'legalSection' || block.type === 'textSection') {
        return { ...block, html: sanitizeRichText(String(block.html ?? '')) };
      }
      return block;
    }),
  } as T;
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
