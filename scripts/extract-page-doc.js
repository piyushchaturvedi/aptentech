#!/usr/bin/env node
/**
 * Turns a page copy document (.docx) into structured JSON.
 *
 * The plain text of these documents is ambiguous — in one section a line is a card's title and
 * in the next an identical-looking line is a bullet, and no amount of guessing from sentence
 * length gets that reliably right. The .docx itself carries the answer and it is simply thrown
 * away by a text extraction: a bullet is a paragraph with `<w:numPr>`, and a title is one whose
 * runs are bold. This reads those instead of inferring.
 *
 *   node scripts/extract-page-doc.js "<file.docx>" <slug>
 *
 * Writes scripts/data/page-<slug>.json. Inspect that before applying it — it is the thing the
 * page will be built from.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const [file, slug] = process.argv.slice(2);

if (!file || !slug) {
  console.error('Usage: node scripts/extract-page-doc.js "<file.docx>" <slug>');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`Not found: ${file}`);
  process.exit(1);
}

/** Unzips the .docx into a temporary directory and returns word/document.xml. */
function readDocumentXml(docx) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
  execFileSync('unzip', ['-qo', path.resolve(docx), '-d', dir]);
  const xml = fs.readFileSync(path.join(dir, 'word/document.xml'), 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return xml;
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

/**
 * Every paragraph, with the two facts that disambiguate it.
 *
 * `bullet` comes from the numbering properties Word attaches to a list paragraph. `bold` is
 * true only when *every* run in the paragraph is bold — a sentence with one bold word in the
 * middle is prose, not a heading, and treating it as one would split a section in half.
 */
function paragraphs(xml) {
  /*
    Matched rather than split.

    Splitting on `<w:p` leaves each paragraph's own attributes stranded outside any tag, where a
    strip-the-tags pass turns them into text — `w14:paraId="..."` appearing as a heading. Cutting
    at the first `>` fixes that only for paragraphs that *have* attributes: for a bare `<w:p>`
    the split already consumed the bracket, so the cut lands inside the first real tag and eats
    the content. Capturing the inside of each paragraph avoids both.
  */
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map((match) => {
      const inner = match[1] ?? '';
      const runs = inner.split(/<w:r[ >]/).slice(1);

      const text = decode(
        inner
          .replace(/<w:tab\/>/g, ' ')
          .replace(/<w:br\/>/g, ' ')
          .replace(/<[^>]+>/g, ''),
      )
        .replace(/\s+/g, ' ')
        .trim();

      const withText = runs.filter((r) => /<w:t[ >]/.test(r));
      const bold = withText.length > 0 && withText.every((r) => /<w:b\s*\/>|<w:b [^>]*\/>/.test(r));

      /*
        Which numbered list a paragraph belongs to, not merely whether it is in one.

        Both a card's heading and its sub-points are list paragraphs at level 0, so "is it a
        list item" separates nothing. What does separate them is `numId`: Word gives each list
        its own numbering definition, and these documents consistently put the headings in one
        and the points beneath them in another. The caller uses the first id it meets in a
        section as that section's heading list.
      */
      const numId = (inner.match(/<w:numId w:val="(\d+)"/) ?? [])[1] ?? null;

      return { text, numId, bold };
    })
    .filter((p) => p.text);
}

/**
 * Groups paragraphs under the `Section:` markers the documents use.
 *
 * Inside a section: bullets are bullets; a bold line opens a new item; anything else is prose,
 * belonging to the item above it when there is one and to the section itself when there is not.
 */
function sections(paras) {
  const out = [];
  let current = null;

  for (const p of paras) {
    const marker = p.text.match(/^Section:\s*(.*)$/i);
    if (marker) {
      current = { name: (marker[1] ?? '').trim(), lede: [], items: [], headingList: null };
      out.push(current);
      continue;
    }
    if (!current) {
      current = { name: '', lede: [], items: [], headingList: null };
      out.push(current);
    }

    const last = current.items[current.items.length - 1];

    if (p.numId) {
      // The first list met in a section is that section's headings; every other list in it
      // holds the points that sit under the heading above them.
      current.headingList ??= p.numId;

      if (p.numId === current.headingList) {
        current.items.push({ title: p.text, body: [], bullets: [] });
      } else if (last) {
        last.bullets.push(p.text);
      } else {
        current.lede.push(p.text);
      }
      continue;
    }

    /*
      Not in a list, so it is either a heading or prose, and shape decides.

      Bold would be the obvious signal and is not usable: these documents mark the `Section:`
      lines bold and then leave most card headings with no run properties at all, so trusting it
      drops whole sections without saying so. What does hold is that a sentence ends in terminal
      punctuation and runs long, while a heading is short and ends in neither.
    */
    const isProse = /[.?!]$/.test(p.text) && p.text.length > 70;

    if (!isProse) {
      current.items.push({ title: p.text, body: [], bullets: [] });
      continue;
    }
    if (last) last.body.push(p.text);
    else current.lede.push(p.text);
  }

  return out;
}

const parsed = sections(paragraphs(readDocumentXml(file)));

const outFile = path.join(ROOT, 'scripts/data', `page-${slug}.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      note: `Extracted from ${path.basename(file)} by scripts/extract-page-doc.js. Inspect before applying.`,
      slug,
      sections: parsed.map(({ headingList, ...rest }) => rest),
    },
    null,
    2,
  ) + '\n',
);

console.log(`wrote ${path.relative(ROOT, outFile)}`);
console.log(`  ${parsed.length} sections\n`);
for (const s of parsed) {
  const bullets = s.items.reduce((n, i) => n + i.bullets.length, 0);
  console.log(
    `  ${(s.name || '(opening)').slice(0, 52).padEnd(54)} ${String(s.items.length).padStart(2)} items, ` +
      `${String(bullets).padStart(3)} bullets, ${s.lede.length} lede`,
  );
}
