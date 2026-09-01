/**
 * Finds placeholder text that is actually visible to a reader.
 *
 * The database still holds bracketed tokens in places that are never rendered — the blog
 * article scaffold is stored as a template, not as content — so counting tokens in MongoDB
 * overstates the problem. This crawls the built site instead and reports only what a visitor
 * would see, which is the thing that matters.
 *
 * Script and style blocks are stripped first: a token inside a JSON-LD payload or a CSS rule
 * is not visible text, and flagging it sends you looking for a bug that is not there.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MAX_PAGES = 400;

const visited = new Set();
const findings = [];

/** Retries a connection that never completed; an HTTP status is a real answer. */
async function get(path) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch(BASE + path, { redirect: 'follow' });
    } catch (cause) {
      if (attempt >= 3) throw cause;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1) ** 2));
    }
  }
}

/** Visible text only — markup, scripts, styles and attributes removed. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

/**
 * A placeholder, not ordinary prose in brackets.
 *
 * Requires the first character to be an uppercase letter and the body to avoid lower-case
 * sentence punctuation, so "[H2 — first section]" is caught while a legitimate aside like
 * "[see the docs]" is not.
 */
const TOKEN = /\[[A-Z][A-Za-z0-9 ,._/&|:'’—-]{1,120}\]/g;

async function crawl() {
  const queue = ['/'];
  const seen = new Set(queue);
  let pages = 0;

  while (queue.length && pages < MAX_PAGES) {
    const path = queue.shift();
    pages += 1;
    visited.add(path);

    const res = await get(path);
    if (res.status >= 400) continue;

    const html = await res.text();
    const text = visibleText(html);
    const hits = [...new Set(text.match(TOKEN) ?? [])];
    if (hits.length) findings.push({ path, hits });

    for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const target = m[1];
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }

  return pages;
}

(async () => {
  console.log(`Scanning ${BASE} for visible placeholders\n`);
  const pages = await crawl();

  console.log(`pages scanned : ${pages}`);
  console.log(`pages with visible placeholders : ${findings.length}\n`);

  for (const f of findings.slice(0, 30)) {
    console.log(`  ${f.path}`);
    for (const hit of f.hits.slice(0, 6)) console.log(`      ${hit}`);
  }

  if (findings.length > 30) console.log(`  … and ${findings.length - 30} more pages`);

  process.exitCode = findings.length > 0 ? 1 : 0;
})();
