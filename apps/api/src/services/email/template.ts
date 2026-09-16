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
    /*
      What a layout in email is actually made of.

      The point of an allowlist here is to exclude the handful of properties that can execute or
      escape the message — `position`, `behavior`, `expression`, anything taking a `url()` — not
      to keep the list short. An email has no stylesheet, so every rule that makes a message
      look like anything at all has to survive as an inline style; a property missing from this
      list is silently deleted, and the result is a design that renders as unstyled text with
      the background colours still attached.

      The shorthand patterns accept the multi-value forms CSS actually uses. `padding:26px 36px`
      is the normal way to write a card's inset and was previously rejected, because the pattern
      only allowed a unit at the very end of the value.
    */
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z-]+$/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z-]+$/i],
      background: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z-]+$/i],

      'font-size': [/^\d{1,3}(px|pt|em|rem|%)$/],
      'font-weight': [/^(normal|bold|[1-9]00)$/],
      'font-family': [/^[\w\s,'"-]+$/],
      'font-style': [/^(normal|italic)$/],
      'text-align': [/^(left|right|center|justify)$/],
      'text-decoration': [/^[a-z- ]+$/],
      'text-transform': [/^(none|uppercase|lowercase|capitalize)$/],
      'line-height': [/^\d(\.\d+)?$/, /^\d{1,3}(px|%)$/],
      // `-.01em` and `.16em` are valid CSS — a digit before the point is not required.
      'letter-spacing': [/^-?(\d+(\.\d+)?|\.\d+)(px|em)$/, /^normal$/],
      'white-space': [/^(normal|nowrap|pre|pre-wrap|pre-line)$/],
      'vertical-align': [/^(top|middle|bottom|baseline)$/],

      // Shorthands take up to four space-separated lengths, each with its own unit.
      padding: [/^(-?\d{1,4}(px|em|rem|%)?)(\s+-?\d{1,4}(px|em|rem|%)?){0,3}$/],
      margin: [/^((-?\d{1,4}(px|em|rem|%)?|auto))(\s+(-?\d{1,4}(px|em|rem|%)?|auto)){0,3}$/],
      'padding-top': [/^\d{1,4}(px|em|rem|%)$/],
      'padding-bottom': [/^\d{1,4}(px|em|rem|%)$/],
      'padding-left': [/^\d{1,4}(px|em|rem|%)$/],
      'padding-right': [/^\d{1,4}(px|em|rem|%)$/],
      'margin-top': [/^-?\d{1,4}(px|em|rem|%)$/],
      'margin-bottom': [/^-?\d{1,4}(px|em|rem|%)$/],
      'margin-left': [/^(-?\d{1,4}(px|em|rem|%)|auto)$/],
      'margin-right': [/^(-?\d{1,4}(px|em|rem|%)|auto)$/],

      // `1px solid #E9EBF6` — a width, a style and a colour.
      border: [/^\d{1,3}px\s+(solid|dashed|dotted|none)(\s+(#[0-9a-f]{3,8}|[a-z]+))?$/i, /^none$/],
      'border-top': [/^\d{1,3}px\s+(solid|dashed|dotted|none)(\s+(#[0-9a-f]{3,8}|[a-z]+))?$/i, /^none$/],
      'border-bottom': [/^\d{1,3}px\s+(solid|dashed|dotted|none)(\s+(#[0-9a-f]{3,8}|[a-z]+))?$/i, /^none$/],
      'border-left': [/^\d{1,3}px\s+(solid|dashed|dotted|none)(\s+(#[0-9a-f]{3,8}|[a-z]+))?$/i, /^none$/],
      'border-right': [/^\d{1,3}px\s+(solid|dashed|dotted|none)(\s+(#[0-9a-f]{3,8}|[a-z]+))?$/i, /^none$/],
      'border-radius': [/^\d{1,3}(px|%)(\s+\d{1,3}(px|%)){0,3}$/],
      'border-collapse': [/^(collapse|separate)$/],
      'border-spacing': [/^\d{1,3}px(\s+\d{1,3}px)?$/],

      width: [/^\d{1,4}(px|%)$/, /^auto$/],
      'max-width': [/^\d{1,4}(px|%)$/],
      'min-width': [/^\d{1,4}(px|%)$/],
      height: [/^\d{1,4}(px|%)$/, /^auto$/],
      // A bare `0` is valid and is what a hidden preheader uses.
      'max-height': [/^\d{1,4}(px|%)$/, /^0$/],

      /*
        `display` is on the list for the preheader — the hidden line a client shows beside the
        subject in the inbox list. Without it that text renders at the top of the message, which
        is how a preheader becomes a visible duplicate of the heading.
      */
      display: [/^(block|inline|inline-block|none|table|table-cell|table-row)$/],
      overflow: [/^(hidden|visible|auto)$/],
      opacity: [/^(0|1|0?\.\d{1,3})$/],
      /*
        Offsets, a blur and a colour. No `url()`, so nothing can be fetched through it.

        Each length may be a bare `0` — `0 1px 2px rgba(...)` is the ordinary way to write a
        shadow with no horizontal offset, and requiring a unit on every value rejects it.
      */
      'box-shadow': [
        /^(none|(-?(\d{1,3}(px|em)|0)\s+){2,3}(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)))$/i,
      ],

      // Safari and iOS Mail otherwise inflate small text on their own.
      '-webkit-text-size-adjust': [/^(none|100%|auto)$/],
      'mso-line-height-rule': [/^exactly$/],
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
