/**
 * Compares captured layout signatures, original against migrated.
 *
 * Two elements are treated as laid out the same when their width and horizontal position
 * (measured in thousandths of the viewport, so the comparison holds at any emulated size)
 * and their height agree within tolerance, and when the computed styles that decide how
 * they read are identical.
 *
 * Height tolerance is generous — 2% or 4px, whichever is larger — because text wrapping
 * differs by a pixel or two between two renders of the same font; width and position are
 * held to a tenth of a percent of the viewport, which is where real layout drift shows up.
 *
 * Usage: node scripts/layout-report.js [page-filter]
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve(__dirname, '../.parity');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));

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

const captures = fs
  .readdirSync(DIR)
  .filter((f) => f.startsWith('lo-') && f.endsWith('.json'))
  .map((f) => f.slice(3, -5));

const pairs = captures
  .filter((n) => n.startsWith('o-'))
  .map((n) => n.slice(2))
  .filter((n) => captures.includes('m-' + n))
  .sort();

const only = process.argv[2];
let failures = 0;

for (const name of pairs) {
  const a = load('lo-o-' + name);
  const b = load('lo-m-' + name);

  const diffs = [];

  for (const [key, box] of Object.entries(a.elements)) {
    const other = b.elements[key];
    if (!other) continue; // structural parity is the other report's job

    const heightTolerance = Math.max(4, box.h * 0.02);

    if (Math.abs(box.w - other.w) > 1) diffs.push(`${key}  width ${box.w}‰ vs ${other.w}‰`);
    else if (Math.abs(box.x - other.x) > 1) diffs.push(`${key}  x ${box.x}‰ vs ${other.x}‰`);
    else if (Math.abs(box.h - other.h) > heightTolerance) diffs.push(`${key}  height ${box.h}px vs ${other.h}px`);
    else {
      for (const prop of STYLES) {
        if (box[prop] !== other[prop]) {
          diffs.push(`${key}  ${prop}: ${box[prop]} vs ${other[prop]}`);
          break;
        }
      }
    }
  }

  /*
    Horizontal overflow is compared, not merely detected. The source home page overflows by
    302px at 375px wide — a defect the design already had — so flagging any overflow would
    report an inherited bug as a migration failure. What matters is that the migration does
    not overflow where the original did not, and not by more where it did.
  */
  const inherited = a.overflow > 0;
  const overflow =
    b.overflow > a.overflow
      ? ` OVERFLOW ${b.overflow}px (original ${a.overflow}px)`
      : inherited
        ? ` overflow ${b.overflow}px — same as the original, inherited from the source`
        : '';
  const ok = diffs.length === 0 && b.overflow <= a.overflow;
  if (!ok) failures += 1;

  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(38)} ${String(a.viewport).padStart(5)}px  ` +
      `compared ${Object.keys(a.elements).length}  differences ${diffs.length}${overflow}`,
  );

  if (!ok && (!only || name.includes(only))) {
    for (const line of diffs.slice(0, 25)) console.log(`        ${line}`);
    if (diffs.length > 25) console.log(`        … and ${diffs.length - 25} more`);
  }
}

console.log(`\n${pairs.length - failures}/${pairs.length} layout captures match.`);
process.exit(failures ? 1 : 0);
