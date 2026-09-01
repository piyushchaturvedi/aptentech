/**
 * DOM signature capture, served to the browser as a module.
 *
 * Importing this from a page walks the rendered DOM, records every element that carries a
 * class or is structurally significant, and posts the result to the collector. Serving it
 * rather than pasting the same snippet into each page keeps the 25 page-by-page
 * comparisons short and identical — the capture logic cannot drift between pages.
 *
 * Usage from the page being captured:
 *   await import('http://localhost:8080/sig.js?n=<name>')
 *
 * Reveal-animation and open/closed state classes are filtered out: they change with scroll
 * position and interaction, not with structure, and would produce differences that are not
 * real.
 */
const KEEP = new Set([
  'SECTION', 'ARTICLE', 'FORM', 'NAV', 'HEADER', 'FOOTER', 'MAIN',
  'H1', 'H2', 'H3', 'H4', 'FIGURE', 'BLOCKQUOTE', 'DL', 'TABLE',
]);

const TRANSIENT = /^(rv|in|d[0-9]|is-hidden|open|on|err|scrolled)$/;

function signature() {
  const out = [];

  const walk = (el) => {
    for (const child of el.children) {
      const tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'svg' || tag === 'SVG') continue;

      const classes = (child.getAttribute('class') || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .filter((c) => !TRANSIENT.test(c))
        .sort();

      if (classes.length || KEEP.has(tag)) {
        out.push(
          tag.toLowerCase() +
            (classes.length ? '.' + classes.join('.') : '') +
            (child.id ? '#' + child.id : ''),
        );
      }
      walk(child);
    }
  };

  walk(document.body);
  return out;
}

const name = new URL(import.meta.url).searchParams.get('n') || 'unnamed';
const captured = signature();

await fetch('http://localhost:8080/collect', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name, signature: captured }),
});

window.__sig = { name, count: captured.length };
