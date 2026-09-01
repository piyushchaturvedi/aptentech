/**
 * Crawls the migrated site and checks every link it finds.
 *
 * The audit found roughly 1,850 navigation links in the source collapsing onto five stub
 * paths, several of which had no page behind them, plus a number of `href="#"` placeholders.
 * This walks the built site from the homepage, follows every internal link it can reach,
 * and reports four classes of problem:
 *
 *   - **dead**   — an internal link whose target returns 404 (or any non-2xx/3xx status)
 *   - **empty**  — `href=""` or `href="#"`, which look like links but go nowhere
 *   - **anchor** — `#section` links whose target id is not on the page that offers them
 *   - **outside** — links leaving the site, reported for review rather than as errors
 *
 * Run against a server started from a production build:
 *
 *   node scripts/verify-links.js               # defaults to http://localhost:3000
 *   node scripts/verify-links.js http://host   # or an explicit origin
 *
 * Exits non-zero if anything in the first three classes is found, so it can gate a deploy.
 */
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const MAX_PAGES = 200;

/** Extracts `href` values and the ids present on a page. */
function parse(html) {
  const links = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>/g)].map((m) => m[1]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  return { links, ids };
}

function isInternal(href) {
  return href.startsWith('/') && !href.startsWith('//');
}

const visited = new Map(); // path -> status
const problems = { dead: [], empty: [], anchor: [], outside: new Set() };

/**
 * Fetches a page, retrying a connection that never completed.
 *
 * The crawler opens hundreds of requests in a row against a dev server that compiles routes
 * on demand, so a pooled socket can sit idle past the server's keep-alive window and fail
 * with `ECONNRESET` before a byte is sent. Left unhandled that aborts the whole run and
 * looks like a site failure, which is the opposite of what this script is for. Only the
 * connection is retried — any HTTP status is a real answer and is reported as it stands.
 */
async function get(path) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch(BASE + path, { redirect: 'follow' });
    } catch (cause) {
      if (attempt >= 3) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1) ** 2));
    }
  }
}

async function status(path) {
  if (visited.has(path)) return visited.get(path);
  const res = await get(path);
  visited.set(path, res.status);
  return res.status;
}

async function crawl() {
  const queue = ['/'];
  const seen = new Set(queue);
  let pages = 0;

  while (queue.length && pages < MAX_PAGES) {
    const path = queue.shift();
    pages += 1;

    const res = await get(path);
    visited.set(path, res.status);

    if (res.status >= 400) {
      continue;
    }

    const html = await res.text();
    const { links, ids } = parse(html);

    for (const href of links) {
      if (!href || href === '#') {
        problems.empty.push({ page: path, href: href || '(empty)' });
        continue;
      }

      if (href.startsWith('#')) {
        // An in-page anchor: the target has to exist on the page offering it.
        if (!ids.has(href.slice(1))) problems.anchor.push({ page: path, href });
        continue;
      }

      if (!isInternal(href)) {
        if (/^(https?:)?\/\//i.test(href)) problems.outside.add(href);
        continue;
      }

      const [target, hash] = href.split('#');
      const code = await status(target);

      if (code >= 400) {
        problems.dead.push({ page: path, href, status: code });
        continue;
      }

      if (hash) {
        // Through `get`, so a dropped keep-alive socket is retried rather than aborting the
        // whole run — the same reason the page fetches go through it.
        const targetHtml = await (await get(target)).text();
        if (!parse(targetHtml).ids.has(hash)) problems.anchor.push({ page: path, href });
      }

      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }

  return pages;
}

function list(title, rows, format) {
  console.log(`\n${title}: ${rows.length}`);
  for (const row of rows.slice(0, 40)) console.log(`  ${format(row)}`);
  if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`);
}

(async () => {
  console.log(`Crawling ${BASE}\n`);
  const pages = await crawl();

  const checked = [...visited.entries()];
  const ok = checked.filter(([, code]) => code < 400).length;

  console.log(`pages crawled : ${pages}`);
  console.log(`urls checked  : ${checked.length}`);
  console.log(`reachable     : ${ok}`);

  list('DEAD internal links', problems.dead, (r) => `${r.status}  ${r.href}   (on ${r.page})`);
  list('EMPTY or "#" links', problems.empty, (r) => `${r.href}   (on ${r.page})`);
  list('BROKEN in-page anchors', problems.anchor, (r) => `${r.href}   (on ${r.page})`);

  const outside = [...problems.outside].sort();
  console.log(`\nExternal links (not fetched): ${outside.length}`);
  for (const href of outside.slice(0, 20)) console.log(`  ${href}`);

  const failures = problems.dead.length + problems.empty.length + problems.anchor.length;
  console.log(`\n${failures === 0 ? 'PASS — every link resolves.' : `FAIL — ${failures} link problems.`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
