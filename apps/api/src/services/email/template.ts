/**
 * Template rendering.
 *
 * The substitution below is the whole engine, and that is the point. A template is data: it
 * may name a variable from a fixed list and nothing else. There is no expression syntax, no
 * property path, no loop and no include, so a compromised editor account cannot turn a
 * template into a way of running code on the server or of reading state it was never given.
 *
 * The cost of that choice is that templates cannot express conditionals. In exchange, the
 * worst a malicious template can do is render the wrong words.
 */
import sanitizeHtml from 'sanitize-html';
import { TEMPLATE_VARIABLES, type TemplateVariable } from '@aptentech/shared';

export type TemplateContext = Partial<Record<TemplateVariable, string>>;

const KNOWN = new Set<string>(TEMPLATE_VARIABLES);

/** Escapes a value going into HTML. Every variable is untrusted — most come from the client. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitutes `{{variable}}` occurrences.
 *
 * An unknown name is left exactly as written rather than replaced with an empty string. A
 * visible `{{clientNmae}}` in a preview is a bug an editor can see and fix; a silent blank
 * is one that reaches a client.
 */
function substitute(source: string, context: TemplateContext, escape: (v: string) => string): string {
  return source.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (whole, rawName: string) => {
    const name = rawName.trim();
    if (!KNOWN.has(name)) return whole;
    const value = context[name as TemplateVariable];
    return value === undefined ? '' : escape(value);
  });
}

/**
 * The markup a template may produce.
 *
 * Narrower than the site's own rich text and for a different reason: this HTML is rendered
 * by mail clients we do not control, so anything scriptable, anything that loads a remote
 * resource on open, and anything that can be positioned over other content is refused.
 * Inline styles are allowed because email has no other styling mechanism, but only for a
 * short list of properties — `position` and `behavior` are not among them.
 */
const EMAIL_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'div',
    'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'small',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    table: ['width', 'cellpadding', 'cellspacing', 'border', 'style', 'role'],
    td: ['align', 'valign', 'width', 'colspan', 'rowspan', 'style'],
    th: ['align', 'valign', 'width', 'colspan', 'rowspan', 'style'],
    tr: ['style'],
    '*': ['style'],
  },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z-]+$/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z-]+$/i],
      'font-size': [/^\d{1,3}(px|pt|em|rem|%)$/],
      'font-weight': [/^(normal|bold|[1-9]00)$/],
      'font-family': [/^[\w\s,'"-]+$/],
      'text-align': [/^(left|right|center|justify)$/],
      'text-decoration': [/^[a-z- ]+$/],
      'line-height': [/^\d(\.\d+)?$/, /^\d{1,3}(px|%)$/],
      padding: [/^[\d\s]{1,20}(px|em|%)?$/],
      'padding-top': [/^\d{1,3}(px|em|%)$/],
      'padding-bottom': [/^\d{1,3}(px|em|%)$/],
      'padding-left': [/^\d{1,3}(px|em|%)$/],
      'padding-right': [/^\d{1,3}(px|em|%)$/],
      margin: [/^[\d\sa-z]{1,20}(px|em|%)?$/],
      border: [/^[\w\s#]{1,40}$/],
      'border-radius': [/^\d{1,3}(px|%)$/],
      'border-collapse': [/^(collapse|separate)$/],
      width: [/^\d{1,4}(px|%)$/],
      'max-width': [/^\d{1,4}(px|%)$/],
    },
  },
  // Only schemes that cannot execute. `javascript:` and `data:` are absent deliberately:
  // some mail clients still follow them, and a data: URI is a way to smuggle a payload.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  transformTags: {
    // A link opened from mail lands in a browser the sender does not control; `noopener`
    // stops the opened page from reaching back through `window.opener`.
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
};

export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, EMAIL_HTML_OPTIONS);
}

/**
 * Renders one template.
 *
 * Order matters: variables are substituted first and the result is sanitised afterwards.
 * Sanitising the template alone would leave a hole, because a value containing markup would
 * then be injected into already-cleaned HTML. Values are HTML-escaped as they go in, and the
 * whole document is sanitised after, so both the template and the data are covered.
 */
export function renderTemplate(
  template: { subject: string; html: string; text: string },
  context: TemplateContext,
): { subject: string; html: string; text: string } {
  const identity = (v: string) => v;

  return {
    // A subject is a header, not markup: escaping it would show `&amp;` to the reader.
    // Line breaks are stripped here because a header cannot contain them.
    subject: substitute(template.subject, context, identity).replace(/[\r\n]+/g, ' ').trim(),
    html: sanitizeEmailHtml(substitute(template.html, context, escapeHtml)),
    text: substitute(template.text, context, identity),
  };
}

/**
 * Derives a plain-text body from HTML when a template has none.
 *
 * A missing text part is a real deliverability problem, so an empty one is filled rather
 * than sent blank. Block-level tags become line breaks so the result reads as paragraphs
 * instead of one run-on line.
 */
export function htmlToText(html: string): string {
  return sanitizeHtml(
    html
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(table|ul|ol)>/gi, '\n'),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
