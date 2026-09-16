#!/usr/bin/env node
/**
 * Applies one block of CSS to every page stylesheet.
 *
 * The eight files below are copies of one another — 554 of home.css's 556 lines appear
 * identically in all of them, because each page template carries its own duplicate of the
 * shared base. A fix hand-edited into one file therefore reaches one template and silently
 * misses the other seven, which is the specific way mobile bugs have survived here.
 *
 * So shared corrections go in the block below and this applies them everywhere at once. The
 * block is appended at the end of each file rather than merged into it: appending cannot
 * reorder or alter a single existing rule, so the approved design stays reachable only
 * through the selectors written here.
 *
 * Re-running replaces the previous block rather than stacking another copy.
 *
 *   node scripts/patch-shared-css.js            # report what would change
 *   node scripts/patch-shared-css.js --apply
 *
 * The real fix for the duplication is to extract the shared base into one stylesheet the
 * layout imports once. Until that happens, this keeps the copies honest.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STYLES = path.join(ROOT, 'apps/web/src/styles');
const APPLY = process.argv.includes('--apply');

const FILES = ['home', 'site', 'about', 'contact', 'blog', 'blog-detail', 'legal', 'portfolio'];

const MARKER = '/* ---------------------------------------------------------------- shared corrections */';

const BLOCK = `
${MARKER}
/*
  Everything below is applied to all eight page stylesheets by scripts/patch-shared-css.js.
  Edit it there, not here — a change made in one copy reaches one template and no others.
*/

/*
  Grid items may shrink below their contents.

  A grid item's \`min-width\` defaults to \`auto\`, which means "never narrower than my own
  min-content width". Both shells below put a row of nowrap chips in one of their columns on
  mobile, and that row's min-content width — every chip laid end to end, about 510px — became
  the column's floor. The grid could not collapse to the 324px available, so the document came
  out 528px wide inside a 360px viewport.

  Nothing looked wrong, because \`body{overflow-x:hidden}\` clipped the excess and made
  \`scrollWidth\` report the viewport width. What it could not hide is Chrome on Android, which
  sizes its minimum zoom from the real content width: the page could be pinched out to 68%
  — 360/528 — leaving the site occupying two thirds of the screen with white beside it.

  \`min-width:0\` lifts that floor, so the chip rows scroll inside their column as intended
  instead of propping it open. At desktop the tracks are far wider than their content, so this
  changes nothing there.
*/
.faq-shell > *,
.svc-shell > *{min-width:0}

/*
  The eyebrow pill is a flex row of three items: the dot, the phrase, and the accent phrase.
  \`flex-wrap\` defaults to nowrap, so a narrow screen shrinks each item rather than wrapping
  the line — the two phrases end up as two ragged columns with a gap down the middle, each
  wrapping inside its own narrow box. Below this width the pill flows as ordinary text, which
  is what it reads as everywhere else.
*/
@media (max-width:560px){
  .pill{display:inline-block; text-align:center; line-height:1.75; padding:7px 15px}
  .pill .dot{display:inline-block; vertical-align:middle; margin-right:5px}
}

/*
  The breadcrumb separator was on \`::before\` of every item but the first, so a list that
  wrapped moved the "/" onto the next line and began it — "HOME / SOLUTIONS" then a line
  starting "/ MUSIC APP DEVELOPMENT".

  Putting it on \`::after\` of every item but the last glues each separator to the crumb it
  follows. A line may now end with one, which is what a separator is for, and can never start
  with one. Spacing is unchanged: either form is a flex item inside the same \`li\`, with the
  same gap on both sides.
*/
.crumb li+li::before{content:none}
.crumb li:not(:last-child)::after{content:"/"; color:#6C77B8}
`;

/* The block this script used to write, so an older one is replaced rather than left behind. */
const OLD_MARKERS = [
  '/* ---------------------------------------------------------------- mobile corrections */',
  MARKER,
];

function stripPrevious(css) {
  for (const marker of OLD_MARKERS) {
    const at = css.indexOf(marker);
    if (at >= 0) return css.slice(0, at);
  }
  return css;
}

let changed = 0;
for (const name of FILES) {
  const file = path.join(STYLES, `${name}.css`);
  const current = fs.readFileSync(file, 'utf8');
  const next = stripPrevious(current).replace(/\s+$/, '\n') + BLOCK;

  if (next === current) {
    console.log(`  ${name}.css  unchanged`);
    continue;
  }

  changed += 1;
  if (APPLY) fs.writeFileSync(file, next);
  console.log(`  ${name}.css  ${APPLY ? 'updated' : 'would change'}`);
}

console.log(`\n${changed} of ${FILES.length} stylesheet(s) ${APPLY ? 'updated' : 'would change'}.`);
if (!APPLY && changed) console.log('Re-run with --apply to write.\n');
