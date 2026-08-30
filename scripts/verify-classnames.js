/**
 * Class-name check.
 *
 * The stylesheets were lifted verbatim from the source, so they only style the class names
 * the source used. A component that invents a name — `cc-viewport` instead of `cc-view` —
 * renders unstyled, and nothing else catches it: the content is present, the parity check
 * passes, and the page is silently broken.
 *
 * This lists every class the components use that has no rule anywhere in the stylesheets.
 */
const fs = require('fs');
const path = require('path');

const WEB = path.resolve(__dirname, '../apps/web/src');
const STYLES = path.join(WEB, 'styles');

/** Every class name that appears in a selector across all extracted stylesheets. */
function stylesheetClasses() {
  const classes = new Set();
  for (const file of fs.readdirSync(STYLES).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(STYLES, file), 'utf8');
    for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(m[1]);
  }
  return classes;
}

/** Every class name used in a `className="..."` or `className={`...`}` in the components. */
function componentClasses(dir, found = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      componentClasses(full, found);
      continue;
    }
    if (!/\.tsx$/.test(entry.name)) continue;

    const src = fs.readFileSync(full, 'utf8');
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const raw = (m[1] ?? m[2] ?? '')
        // Drop template expressions; keep the literal parts around them.
        .replace(/\$\{[^}]*\}/g, ' ');
      for (const cls of raw.split(/\s+/).filter(Boolean)) {
        if (!/^[a-zA-Z][\w-]*$/.test(cls)) continue;
        if (!found.has(cls)) found.set(cls, new Set());
        found.get(cls).add(path.relative(WEB, full));
      }
    }
  }
  return found;
}

/** Names that exist for behaviour or admin UI, not for the migrated stylesheet. */
const EXPECTED_UNSTYLED = new Set([
  'in', // added at runtime by ScrollReveal
  'on', // carousel dot active state, set at runtime
  'err', // validation state, set at runtime
  'open',
  'scrolled',
  'is-hidden',
  'prose', // blog body wrapper, styled by blog-detail.css selectors on children
  // Fragments left behind when a template expression is stripped out of a className.
  // The real names are btn-primary/mint/outline/glass and d0–d3, all of which are styled.
  'btn-',
  'd',
]);

const styled = stylesheetClasses();
const used = componentClasses(path.join(WEB, 'components'));

// Admin has its own stylesheet with an `adm` prefix; check it separately and loosely.
const missing = [];
for (const [cls, files] of used) {
  if (cls.startsWith('adm')) continue;
  if (EXPECTED_UNSTYLED.has(cls)) continue;
  if (!styled.has(cls)) missing.push([cls, [...files]]);
}

console.log(`Stylesheets define ${styled.size} class names.`);
console.log(`Components use ${used.size} class names.\n`);

if (missing.length === 0) {
  console.log('PASS — every class the components use is styled by the migrated CSS.');
  process.exit(0);
}

console.log(`FAIL — ${missing.length} class name(s) used but never styled:\n`);
for (const [cls, files] of missing.sort()) {
  console.log(`  .${cls}`);
  files.forEach((f) => console.log(`      ${f}`));
}
process.exit(1);
