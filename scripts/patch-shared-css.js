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

/*
  Heading scale.

  H1 was capped at 3.5rem (56px). The hero's text column is 574px wide at 1440, so a
  60-character page title — which is the normal length here, the median H1 being 43
  characters — ran to four lines. Measured against the real titles, 36px is the largest cap
  at which every H1 on the site up to 67 characters lands on two lines, so that is the cap:
  \`clamp(1.75rem,2.5vw,2.25rem)\` reaches 36px at 1440 and scales down from there.

  The four hero variants each set their own larger size, and a class beats a bare element
  selector however late it appears, so they have to be named rather than left to the base
  rule. \`.blog-hero h1\` is deliberately absent: it already caps at 2.3rem, and it has a
  short-viewport override further up that this would otherwise outrank.

  H2 follows H1 down and keeps the steps between levels intact — 30px against H1's 36px,
  with \`.h2-sm\` and the blog feature heading below that.
*/
h1,.h1{font-size:clamp(1.75rem,2.5vw,2.25rem)}
.post-hero h1,.legal-hero h1,.pf-hero h1,.lead-banner h1{font-size:clamp(1.7rem,2.5vw,2.25rem)}
h2,.h2{font-size:clamp(1.45rem,2.1vw,1.875rem)}
.h2-sm{font-size:clamp(1.3rem,1.78vw,1.6rem)}
.feat-body h2{font-size:clamp(1.25rem,1.9vw,1.7rem)}

/*
  The hero tick list's three rows did not read as rows.

  On a centred hero the list inherits \`text-align:center\`, so each point's text was centred
  inside its own grid cell: a single-line point sat away from its tick, and a point that
  wrapped put its second line in the middle of the cell. Six points in two columns with six
  different left edges is what made the block look unaligned — measured on the music app
  page, the columns begin at 167px and 464px and almost every point inside them began
  somewhere else.

  Left-aligning the text puts all three rows of a column on one edge, under a tick that was
  already in the right place, and \`align-items:start\` holds a wrapped point's first line
  level with its neighbour's instead of centring it in the taller row.
*/
.hs-points{align-items:start}
.hs-points li{text-align:left}

/*
  The process stepper's labels were being cut off.

  \`.tl-rail\` was a fixed 64px holding a 44px dot, a 12px gap and a label. One line of label
  fits in 77px and overflowed harmlessly into the 26px margin below; two lines need 99px and
  ran 8px underneath the panel that follows, which is what hid every wrapped label's second
  line. Between 861px and roughly 1200px wide most of these labels wrap, so this was visible
  on every page that has the section.

  Letting the rail take its content's height removes the overlap at any label length. The
  margin drops to 13px so that a page whose labels all fit on one line keeps the exact
  spacing it has now: 77 + 13 is the 64 + 26 it replaces. Below 861px the rail is already
  \`height:auto\` in the stacked layout, so this is scoped above that breakpoint.
*/
@media (min-width:861px){ .tl-rail{height:auto; margin-bottom:13px} }

/*
  Home's section headings are centred.

  Every other template keeps the split head — heading left, description right — which is why
  this is scoped to \`.pg-home\` rather than written into the base. \`.pg\` itself is
  \`display:contents\` and exists only to carry that scope; see CmsPage.tsx.

  The two call-to-action blocks are deliberately untouched: \`.strip-in\` and \`.lead\` are
  their own designs and neither uses a section head, so excluding them needs no exception
  here. \`.results-in\` is left alone too — its heading sits above a statistics grid and has
  no right-hand description to centre with it.
*/
.pg{display:contents}
.pg-home .sect-head,
.pg-home .blog-head{text-align:center; flex-direction:column; align-items:center}
.pg-home .sect-head .eyebrow,
.pg-home .blog-head .eyebrow{justify-content:center}
.pg-home .sect-head h2{margin-inline:auto; max-width:22ch}
.pg-home .sect-head .lede{max-width:56ch}

/*
  The banner form's dialling code and verification question.

  \`.phone-row\` and \`.sr-only\` already existed, but only in the stylesheets of the pages that
  happened to need them — the contact template for one, five of the eight for the other. The
  banner form is on every service and solution page, which load site.css, so both are
  restated here rather than left to land on some pages and not others. Re-declaring one
  identically inside a file that already has it changes nothing.

  \`.hf-field\` styled inputs and textareas and never a select, because until now the banner
  form had none. The rule below is the input rule, so the dialling code sits beside the
  number as one control rather than as a browser default dropdown next to a styled box.
*/
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.phone-row{display:grid; grid-template-columns:132px 1fr; gap:10px}
.phone-row select{min-width:0}
@media (max-width:420px){ .phone-row{grid-template-columns:110px 1fr} }
.hf-field select{font-family:var(--body); font-size:.92rem; color:var(--ink); background:var(--paper);
  border:1px solid var(--line); border-radius:var(--r-sm); padding:12px 14px; width:100%; transition:.22s var(--ease)}
.hf-field select:focus{outline:none; border-color:var(--primary); box-shadow:0 0 0 4px rgba(58,49,219,.12)}
.hf-field.err select{border-color:#E0533F; background:#FEF5F3}

/*
  The question, the answer box and the button for a different question, on one row.

  The question is set in the mono face and on a dashed ground so it reads as something to
  be answered rather than another field to fill in, and \`user-select:none\` keeps a double
  click from selecting it as if it were input. At 360px, the common Android width, the three
  controls still fit on one row with a 108px answer box, so the row only breaks in two below
  that, where it would not.
*/
.cap-row{display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:10px}
.cap-q{font-family:var(--mono); font-size:.95rem; font-weight:700; letter-spacing:.04em; color:var(--ink);
  padding:11px 13px; border-radius:var(--r-sm); background:var(--canvas); border:1px dashed var(--line);
  white-space:nowrap; user-select:none; -webkit-user-select:none}
.cap-row input{width:100%}
.cap-new{display:grid; place-items:center; width:44px; height:44px; flex:none; font-size:1.05rem; line-height:1;
  border:1px solid var(--line); border-radius:var(--r-sm); background:var(--paper); color:var(--muted);
  cursor:pointer; transition:.22s var(--ease)}
.cap-new:hover{color:var(--primary); border-color:var(--primary)}
.cap-new[disabled]{opacity:.5; cursor:default}
@media (max-width:339px){
  .cap-row{grid-template-columns:1fr auto}
  .cap-q{grid-column:1 / -1}
}
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
