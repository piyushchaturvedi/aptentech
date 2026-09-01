/**
 * Layout capture, served to the browser as a module.
 *
 * Structural parity says the two pages contain the same elements; this says they are laid
 * out and painted the same way. For every element the signature records, it measures the
 * box the browser actually gave it and the handful of computed styles that decide how it
 * reads — font size, weight, line height, colour, background, padding, border radius — plus
 * whether the document overflows sideways at the current width.
 *
 * Usage from the page being measured:
 *   await import('http://localhost:8080/layout.js?n=<name>')
 *
 * Boxes are recorded relative to the viewport width so the two origins can be compared at
 * the same emulated size without absolute pixel drift from scrollbar differences.
 */
const KEEP = new Set([
  'SECTION', 'ARTICLE', 'FORM', 'NAV', 'HEADER', 'FOOTER', 'MAIN',
  'H1', 'H2', 'H3', 'H4', 'FIGURE', 'BLOCKQUOTE', 'DL', 'TABLE',
]);

const TRANSIENT = /^(rv|in|d[0-9]|is-hidden|open|on|err|scrolled)$/;

const STYLES = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'color',
  'backgroundColor',
  'display',
  'flexDirection',
  'gridTemplateColumns',
  'paddingTop',
  'paddingBottom',
  'borderRadius',
  'textAlign',
];

function key(el) {
  const classes = (el.getAttribute('class') || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => !TRANSIENT.test(c))
    .sort();

  return el.tagName.toLowerCase() + (classes.length ? '.' + classes.join('.') : '') + (el.id ? '#' + el.id : '');
}

function capture() {
  const width = document.documentElement.clientWidth;
  const round = (n) => Math.round(n * 10) / 10;
  const out = {};

  const walk = (el) => {
    for (const child of el.children) {
      const tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'svg' || tag === 'SVG') continue;

      const classes = (child.getAttribute('class') || '').trim();
      if (classes || KEEP.has(tag)) {
        const k = key(child);
        // Only the first occurrence of each key is measured: repeated cards have the same
        // box by construction, and recording all of them would drown the report.
        if (!out[k]) {
          const rect = child.getBoundingClientRect();
          const style = getComputedStyle(child);
          const box = {
            w: round((rect.width / width) * 1000),
            h: round(rect.height),
            x: round((rect.left / width) * 1000),
          };
          for (const prop of STYLES) box[prop] = style[prop];
          out[k] = box;
        }
      }
      walk(child);
    }
  };

  walk(document.body);

  return {
    viewport: width,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    elements: out,
  };
}

const url = new URL(import.meta.url);
const name = url.searchParams.get('n') || 'unnamed';

// Give scroll-reveal animations a moment to settle so heights are the resting ones.
window.scrollTo(0, document.body.scrollHeight);
await new Promise((resolve) => setTimeout(resolve, 400));
window.scrollTo(0, 0);
await new Promise((resolve) => setTimeout(resolve, 300));

const captured = capture();

await fetch('http://localhost:8080/collect', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name, signature: captured }),
});

window.__layout = { name, elements: Object.keys(captured.elements).length, overflow: captured.overflow };
