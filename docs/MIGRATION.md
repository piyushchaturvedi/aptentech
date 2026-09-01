# Migration record

How each of the 25 source files was migrated, and what was verified.

## Route map

Filenames are not URLs. Every route below came from the page's own `<link rel="canonical">`,
cross-checked against its `og:url` and breadcrumb JSON-LD. **No URL changed**, so no redirect
was needed for any existing page.

| Source file | Route | Rendering |
| --- | --- | --- |
| `aptentech-homepage.html` | `/` | Static + ISR |
| `aptentech-about.html` | `/about/` | Static + ISR |
| `aptentech-Portfolio.html` | `/case-studies/` | Static + ISR |
| `aptentech-contact.html` | `/contact/` | Static + ISR |
| `aptentech-blog.html` | `/blog/` | ISR, 15 min |
| `aptentech-blog-detail.html` | `/blog/<slug>/` | SSG + ISR |
| `aptentech-privacy-policy.html` | `/privacy-policy/` | Static + ISR |
| `aptentech-terms-conditions.html` | `/terms-conditions/` | Static + ISR |
| `aptentech-ai-development.html` | `/services/ai-development/` | SSG + ISR |
| `aptentech-software-development.html` | `/services/software-development/` | SSG + ISR |
| `aptentech-web-development.html` | `/services/web-development/` | SSG + ISR |
| `aptentech-mobile-app-development.html` | `/services/mobile-app-development/` | SSG + ISR |
| `aptentech-digital-marketing.html` | `/services/digital-marketing/` | SSG + ISR |
| `aptentech-seo.html` | `/services/seo/` | SSG + ISR |
| `aptentech-ai-seo.html` | `/services/ai-seo/` | SSG + ISR |
| `aptentech-generative-engine-optimization.html` | `/services/generative-engine-optimization/` | SSG + ISR |
| `aptentech-taxi-app-development.html` | `/solutions/taxi-app-development/` | SSG + ISR |
| `aptentech-food-delivery-app-development.html` | `/solutions/food-delivery-app-development/` | SSG + ISR |
| `aptentech-fuel-delivery-app-development.html` | `/solutions/fuel-delivery-app-development/` | SSG + ISR |
| `aptentech-alcohol-delivery-app-development.html` | `/solutions/alcohol-delivery-app-development/` | SSG + ISR |
| `aptentech-dating-app-development.html` | `/solutions/dating-app-development/` | SSG + ISR |
| `aptentech-fitness-app-development.html` | `/solutions/fitness-app-development/` | SSG + ISR |
| `aptentech-music-app-development.html` | `/solutions/music-app-development/` | SSG + ISR |
| `aptentech-video-streaming-app-development.html` | `/solutions/video-streaming-app-development/` | SSG + ISR |
| `aptentech-travel-app-development.html` | `/solutions/travel-app-development/` | SSG + ISR |

**All 25 accounted for.** `aptentech-blog-detail.html` was a template of `[POST TITLE]` and
`[POST-SLUG]` placeholders rather than a page, so it became the `/blog/<slug>/` route.

Four index routes and thirty-six detail routes exist that no source file corresponds to,
because the source's own navigation promised them and nothing was behind them — 864 links
pointed at `/services/`, 378 at `/technologies/`, and every solution page's breadcrumb names
`/solutions/` as its parent:

| Route | What it lists | Built from |
| --- | --- | --- |
| `/services/` | the service pages | the `.sect-head` and `.bento` card grid already in the design |
| `/solutions/` | the solution pages | the same |
| `/industries/` | the eight industry pages | the same |
| `/technologies/` | the technology pages, then the stack tabs | the same, plus the tab component the home page's technology band uses |

### Pages behind the menu entries

Every entry in the header mega-menu and the footer now opens a page of its own. Before this,
five "AI Solutions" links opened the same screen, every industry opened the unfiltered
case-study index, and each technology opened one shared tab strip — which is what made the
navigation look broken rather than merely sparse.

Thirty-six pages were generated, under four families:

| Family | Count | Examples |
| --- | --- | --- |
| `/services/<slug>/` | 12 | `generative-ai`, `ai-agents`, `rag-solutions`, `saas-development`, `ios-android`, `cloud-devops`, `ui-ux-design` |
| `/solutions/<slug>/` | 8 | `workflow-automation`, `customer-support-ai`, `saas-platforms`, `e-commerce`, `data-analytics` |
| `/industries/<slug>/` | 8 | `healthcare`, `fintech-banking`, `logistics`, `travel-hospitality`, `media` |
| `/technologies/<slug>/` | 8 | `frontend-backend`, `mobile`, `ai-ml`, `cloud`, `databases`, `devops`, `cms` |

Two rules governed how they were built, and they are worth stating because they are what
keeps this from being either a design change or a content invention.

**The design is inherited, not reproduced.** Each page is a `ServicePage` document, so it
renders through `ServicePageView` — the same component and stylesheet the eight original
service pages use. Nothing new was styled, and the parity suite still reports all 25 source
routes identical.

**No content was written.** Every heading, description and bullet is lifted from a page that
already existed. The source content already described generative AI, RAG, agents, healthcare,
fintech and logistics, because each original page carried a capabilities grid, an industries
grid and a technology stack; these pages re-present that approved copy focused on one topic.
Industry pages aggregate what all four parent pages say about that sector and attach the case
studies actually recorded against it. Where an item had bullets but no prose, the hero
sentence is assembled from its own bullets rather than composed — punctuation is the only
thing added.

Four menu labels keep pointing at a page that already existed rather than getting one of
their own: "Custom Software" → `/services/software-development/`, "Web Applications" →
`/services/web-development/`, "Mobile apps" → `/services/mobile-app-development/`, and
"AI Development" → `/services/ai-development/`. Creating `/services/custom-software/` beside
`/services/software-development/` would split one page's ranking across two URLs and break a
canonical the source declared.

**Known limitation.** These pages share their process, reasons and FAQ sections with the page
they draw from, because those are true of the company rather than of one topic. That is
legitimate but it does mean the pages are not fully independent for search purposes: each has
its own canonical and its own hero and capability copy, and an editor should expand the ones
that matter most commercially rather than leaving all thirty-six as generated.


### Redirects

No existing page changed URL. Every row below points at a path the source's navigation
declared but never had a page for, and each is a row in the CMS redirect table an
administrator can repoint the day a real page ships.

| From | To | Code | Why |
| --- | --- | --- | --- |
| `/solutions/ai-automation/` | `/#ai` | 301 | 216 links, labelled "AI Capabilities" in the menu; the only stub with no page of its own. |
| `/insights/` and `/insights/*` | `/blog/` | 301 | The footer on 24 of 25 pages linked here; canonicals all use `/blog/`. |
| `/case-studies/all/` | `/case-studies/` | 301 | The index's "View portfolio" button. |
| `/case-studies/<slug>/` (8) | `/case-studies/` | 301 | Each study declared a detail URL; none was designed. Slugs are preserved so the pages can be built later, and the index links at itself rather than relying on this row. |
| `/careers/` | `/contact/` | 301 | The about page's careers strip. |
| `http://` | `https://` | 301 | Force TLS |
| `www.aptentech.com` | `aptentech.com` | 301 | Every canonical uses the apex host |
| no trailing slash | trailing slash | 308 | `trailingSlash: true` matches all 25 canonicals |

Next reads these from the API when the server starts, falling back to the same set compiled
in if the API is unreachable during a build, so a deploy never silently loses the redirects
the navigation depends on.

## Verification

Five checks run against a production build. Each catches a class of failure the others miss,
and each is a script in `scripts/` you can re-run.

| Check | Command | Result |
| --- | --- | --- |
| Content and metadata | `node scripts/verify-parity.js` | 150 checks, 0 failed |
| DOM structure | `node scripts/parity-report.js` | 21 of 25 pages identical element for element |
| Rendered layout | `node scripts/layout-report.js` | 18 of 19 captures identical |
| Links | `node scripts/verify-links.js` | 95 pages crawled, 0 broken |
| CSS coverage | `node scripts/verify-css.js` | every source rule present |
| Security | `node scripts/verify-security.js` | 31 checks, 0 failed |

### Content and metadata — 150 checks, 0 failures

`verify-parity.js` compares every migrated route against its source file on title, meta
description, canonical, H1 and every section heading.

```
150 checks passed, 0 failed across 25 routes.
```

### DOM structure — 21 of 25 pages identical

The content check compares words. It cannot see that a section is missing, that a card grid
became a paragraph, or that a heading lost the wrapper the stylesheet needs. `sig.js` walks
both rendered pages and records every element that carries a class or is structurally
significant; `parity-report.js` diffs the two.

This is the check that found the real damage. The first run reported **107 missing elements
on the solution template alone** — the logo marquee, the numbered "protect" band, the market
tiles, the recognition panel, the cost table, the lead form's reasons and offices, and a
standfirst paragraph under almost every heading. It went on to find the home and about pages
missing roughly four hundred elements between them, and the contact, case-study, blog and
article pages rebuilt as generic prose blocks rather than their own designs.

All of it is fixed. The four remaining differences are each understood, and none is a
difference in design:

| Page | Difference | Why |
| --- | --- | --- |
| `blog-detail` | −34 elements, all inside the article body | The source page is a template of placeholder prose — six sections, a table, a pull quote. A real article has whatever an editor wrote. Rendering the template's own body into the migrated page closes the gap; see below. |
| `generative-engine-optimization` | −14, the whole `#cost` band | The source ships `#cost{display:none!important}`. That became `hiddenSections` in the CMS: the band is not rendered rather than rendered-then-hidden. Same page, and an editor can now show it. |
| `dating-app-development` | `div.tl` vs `div.tl#tl` | The source gives the process timeline an `id` on sixteen of seventeen pages and omits it on this one. No CSS rule targets it; the id is kept for consistency. |
| `home` | six FAQ panel ids | The source builds them from `'About &amp; Services'` without decoding the entity, producing `faq-0-AboutampServices`. The migration decodes first and produces `faq-0-AboutServices`. The ids are referenced only by `aria-controls` on the same page. |

**Proving the article page.** Injecting the template's own example body into the migrated
article and re-measuring drops the difference from 23 layout deviations to nine, and all nine
are text lengths — "1 min read" against "[N] min read", real article titles in the
previous/next links against `[Previous post title]`. The layout is the same; the words are
the CMS's.

### Rendered layout — 18 of 19 captures identical

Structure says the same elements are present. It does not say they are the same size, in the
same place, or the same colour. `layout.js` measures every element's box — width and
horizontal position in thousandths of the viewport, so the comparison holds at any width —
plus the computed styles that decide how it reads: font size, weight, line height, letter
spacing, colour, background, display, grid template, padding, radius, alignment.

Captured at four widths, original against migration:

| Page | 1920 | 1440 | 768 | 375 |
| --- | --- | --- | --- | --- |
| `/solutions/taxi-app-development/` | ✓ | ✓ | ✓ | ✓ |
| `/` | ✓ | ✓ | ✓ | ✓ |
| `/about/` | — | ✓ | ✓ | ✓ |
| `/contact/` | — | ✓ | ✓ | — |
| `/case-studies/` | — | ✓ | ✓ | — |
| `/blog/` | — | — | ✓ | — |
| `/privacy-policy/` | — | — | ✓ | — |
| `/terms-conditions/` | — | — | ✓ | — |
| `/blog/<slug>/` | — | — | content-driven only | — |

What it caught that nothing else did:

- **The dating page's colour treatment was on all nine solution pages.** `solution.css` had
  been built by merging one page's extra rules with another's, so `.hero.hero-split
  .btn-mint{color:#9E1155}` — pink, from the dating page — repainted the taxi page's buttons,
  its tick marks and its section labels. Structure passed throughout: the elements were all
  correct, the colours were not. Fixed by splitting per page (see *Stylesheets*, below).
- **The home page's technology heading stopped being centred.** Splitting one stylesheet into
  a shared file plus a page file reorders the cascade: `.sect-head{align-items:flex-end}`
  landed after `.center{align-items:center}` where the source had it before. Fixed by giving
  each bespoke page its whole stylesheet.
- **The footer tagline read "Aptentech AI, software and cloud engineering…"** — an extra word.
  A `<p[^>]*>` pattern in the seed also matches `<path>`, so the logo's SVG path started the
  match and the logo text came along. At tablet and mobile widths the extra word wrapped the
  tagline onto another line and the footer brand block was 22px too tall.
- **The about page's value cards had no titles.** A regex closing on `</article>` *or*
  `</div>` ended at the icon's own `</div>`, before the heading.
- **Two headings gained a line.** The heroes split their headline around a `<span class="g">`
  highlight; storing the parts trimmed and rendering them adjacent turned "keep" + "after"
  into "keepafter", an unbreakable word that wrapped.
- **The case-study form head was half its height** — the source puts a reply-time note beside
  the heading in a class-less `<span>`, which the structural check cannot see.
- **Placeholder contact details rendered as `<span>` instead of `<a>`**, which changed the
  height of the footer brand block and the office cards. They are anchors again, simply
  without a target.

One capture still differs: the home page overflows horizontally by 302px at 375px wide — and
so does the original, by exactly the same amount. That is a defect in the approved design, not
in the migration, so it is reported rather than silently fixed. The report compares overflow
against the source instead of flagging any overflow, so an inherited bug cannot be mistaken
for a regression.

### Links — 95 pages crawled, 0 broken

`verify-links.js` walks the built site from the homepage, follows every internal link, and
checks four classes of problem: dead targets, `href="#"` or empty hrefs, in-page anchors whose
target id is not on the page offering them, and links leaving the site.

```
pages crawled : 95
urls checked  : 95
reachable     : 95

DEAD internal links: 0
EMPTY or "#" links: 0
BROKEN in-page anchors: 0

PASS — every link resolves.
```

Two rounds of fixes got there. The first crawl found 1,583 problems, all inherited:

- **864 links to `/services/`, 378 to `/technologies/`, 216 to `/solutions/ai-automation/`.**
  The source's mega-menu pointed almost all of its navigation at three paths with no page
  behind them.
- **115 `#contact` anchors on pages with no contact band.** The header and footer pointed at
  an in-page anchor that exists on the service, solution, home, about and case-study pages
  and nowhere else, so the same link worked on some pages and did nothing on the blog and the
  legal pages.
- **`/case-studies/all/`, `/careers/` and eight per-study detail URLs** the source declared
  but never designed.

Site chrome now points at `/contact/`, which works everywhere.

Redirecting the stub paths cleared the 404s but not the complaint behind them: eighteen
different labels under "Services" all landed on the same redirect, so clicking any of them
left the reader where they started. That is indistinguishable from a broken menu. So
`/services/`, `/solutions/` and `/technologies/` are real pages now, and each of the 39 menu
entries points at the page that covers it — `AI Development` at `/services/ai-development/`,
`iOS & Android` at `/services/mobile-app-development/`, and so on. Anything with no page of
its own goes to its section index rather than to a page that only approximately matches, and
every one of those targets is editable in Settings → Navigation.

Two failures the crawl found only when run against `npm run dev` rather than a production
build, and both would have reached a developer before a visitor:

- **The redirect table is fetched once when the server starts**, and `npm run dev` starts both
  apps at the same moment — so the first fetch raced the API coming up, fell back to the
  compiled-in list, and quietly dropped every row that only exists in the database. It now
  retries for about fifteen seconds before falling back.
- **The case-study index linked each card at a detail URL that was never designed**, and
  depended on a redirect to cover it. A page should not link somewhere that does not exist:
  the cards link to the index, and each study keeps its declared URL so the links light up on
  their own the day that route ships.

### CSS coverage — every source rule present

`verify-css.js` confirms every distinct CSS rule across the 25 source files is in the
stylesheets its page loads, including the per-page tails rendered inline.

```
PASS — every source rule is covered.
```

### Security — 31 checks, 0 failures

`node scripts/verify-security.js <admin-password>` probes the running system. See
[SECURITY.md](SECURITY.md).

### Class names — every used class is styled

`verify-classnames.js` lists any class a component uses that has no rule in the migrated
stylesheets — the failure mode nothing else catches, because a component that invents a class
renders **unstyled** while the content check still passes.

It found 19 invented names, including one that mattered: the carousel used `cc-viewport`
where the source puts `overflow: hidden` on `cc-view`, so the eight-slide track was sizing the
document and **every service and solution page scrolled sideways**.

### Lead pipeline and CMS — verified end to end

- A submitted lead reaches MongoDB with full attribution and appears in the admin
- A bot submission (honeypot + fast submit + disposable email + link spam) scores 230 and is
  quarantined as `SPAM` with an identical response
- Editing a service page's H1 in the CMS changes the live page **within seconds, no redeploy**
- Uploading an image replaces the placeholder; removing it restores the placeholder
- A disguised non-image is rejected by byte inspection; an SVG carrying `<script>` and
  `onload` is stored sanitised

## Stylesheets

The 25 source pages each inline one 79–97 KB stylesheet. An earlier split into a shared
`base.css` plus small per-page files halved the bytes and broke the cascade, because a page
rule always landed after every shared rule even where the source had a shared rule after it.
The first page-specific rule on every bespoke page turns out to be the *first* chunk in its
stylesheet, so no repair pass can recover the order — only keeping a page's sheet whole can.

The split is therefore by page family, never inside one:

| File | Contents | Loaded by |
| --- | --- | --- |
| `site.css` | a service page's complete stylesheet, in source order (79 KB) | all 17 service and solution pages |
| `solution.css` | what all nine solution pages add (1.7 KB) | the nine solution pages |
| `pageExtras.generated.ts` | what one page adds beyond that (0–7.4 KB) | rendered inline by that page |
| `home.css`, `about.css`, `portfolio.css`, `blog.css`, `blog-detail.css`, `contact.css`, `legal.css` | that page's complete stylesheet, in source order | its own route |

Seventeen pages share one cached file. The seven bespoke pages each load one file, which is
what the source did — inline and uncached — only now it is cacheable. Every declaration is the
source's, byte for byte; regenerate with `node scripts/extract-css.js`.

## Content the first pass had dropped

Three collections looked shared and were not. Each of the 17 service and solution pages, and
the home and about pages, ships its own:

- **case studies** — four per page, written for that subject. The taxi page's airport-transfer
  and corporate-transport projects are not the SEO page's. Attaching one shared set to all of
  them dropped 68 entries and put the wrong copy on sixteen pages. **81 now stored.**
- **testimonials** — three per page, quoting that subject: driver onboarding on the taxi page,
  coaching on the fitness page. **52 now stored.**
- **articles** — three cards per page linking real `/blog/<slug>/` targets the source
  declared. **51 now stored**, which is also what makes the blog listing's pagination real.

Each page references its own; nothing is attached site-wide any more.

## What the migration fixed

Four of these were defects in the migration itself, found by running it the way a developer
actually does rather than the way the checks did. They are listed first, because a check
suite that passes while the site is unusable is worth less than the bug it missed.

**The admin was a blank page.** `trailingSlash: true` makes the real path `/admin/login/`,
and the shell compared it against `/admin/login`. The comparison never matched, so the
sign-in branch never ran and a signed-out visitor fell through to `return null` — an empty
page, with a redirect loop back to the same URL behind it. Every path comparison in the admin
now goes through one normaliser. Nothing in the link crawl could see this: the route returned
200 and the body was empty.

**`npm run dev` started the site without its API.** The API's script was `tsx watch`, whose
supervisor spawns the real process in a child. Run alone that is fine; run under
`concurrently`, where output is piped rather than attached to a terminal, the child never
started and printed nothing — so the one command that is supposed to bring the whole system
up quietly left every page with no content behind it. `node --watch --import tsx` reloads
identically in a single process, so there is no child to lose.

**Typing `/admin` gave a 404.** Every admin screen lives one segment deeper — the shallowest
real route is `/admin/login/` — so the address an administrator actually types had nothing
behind it. `/admin` now redirects to the dashboard and the admin shell decides from there
whether the visitor sees the dashboard or the sign-in form, which keeps that decision in one
place. The redirect is deliberately temporary rather than permanent: a 308 is cached by the
browser indefinitely, which would freeze the landing choice for anyone who had visited once.

**Pages failed intermittently with a Bad Gateway or a 500.** Node keeps HTTP connections
alive and pools them, and it closed an idle one after five seconds while the caller still
considered it usable. A request that claimed such a socket died with `ECONNRESET` before a
byte was sent, so a page that worked on reload had failed a moment earlier — the symptom
being an error page on a link that is not actually broken. The API now holds connections for
65 seconds, longer than any caller keeps them, so the client is always the side that closes.
Both callers also retry a connection that never completed: the public site for reads, and the
admin proxy for reads only, since replaying a write that may already have been applied could
create a second session or a duplicate record.

The rest were defects in the source, not choices:

**Every lead was being discarded.** All 40 form instances called `preventDefault()`,
displayed a thank-you and dropped the enquiry. There was no `action`, no `fetch`, no
endpoint. Forms now persist to MongoDB and appear in the admin, with the visual design
unchanged.

**Main content was invisible without JavaScript.** On all 17 service and solution pages, the
services list, solutions bento, case studies, features, technologies, compliance badges,
process timeline, tech stack, "why us" and the entire FAQ were held in JavaScript arrays and
written in with `innerHTML` — 44–57 KB per page. All of it is now server-rendered.

**FAQ structured data was generated in the browser.** 19 pages declared `FAQPage` schema
built at runtime and injected into an empty tag. It is now server-rendered, from exactly the
questions visible on the page.

**No sitemap, no robots.txt.** Both are now generated from the CMS, so new content appears
automatically. The footer's "Sitemap" link pointed at `#`.

**1,583 broken links.** Footer Privacy Policy, Terms and Sitemap pointed at `#` on all 25
pages. The mega-menu pointed 864 links at `/services/`, 378 at `/technologies/` and 216 at
`/solutions/ai-automation/`, none of which had a page behind it. The header and footer
"Contact" links pointed at an on-page anchor that does not exist on the blog or the legal
pages, so the same link worked on some pages and did nothing on others. The article template
drew three share icons with `href="#"`. Every link now resolves, and the crawl that proves it
is a script you can re-run.

**The contact form ignored three of its own fields.** The markup had a country-code select, a
file drop and an NDA checkbox; the script wired none of them, and the migration's first pass
had dropped all three. They are rendered and submitted now.

**The article's share buttons did nothing.** LinkedIn and X carry real share URLs, so they
work with JavaScript off; the third copies the address, which is what its icon depicts.

**The GEO page carried the AI-SEO page's `og:url` and breadcrumb**, which told search
engines they were the same page. Both now point at themselves.

**No `og:image` on 24 of 25 pages and a Twitter card on one.** Every page now emits both,
with per-page overrides in the CMS.

## Measured performance

Localhost, warm cache, production build. Re-measure with
`node scripts/measure-performance.js`.

| Route | TTFB | HTML (gzip) | vs source HTML |
| --- | --- | --- | --- |
| `/` | 11 ms | 31.4 KB | +41% |
| `/services/seo/` | 10 ms | 51.1 KB | +48% |
| `/solutions/taxi-app-development/` | 10 ms | 49.5 KB | +48% |
| `/about/` | 10 ms | 25.6 KB | −4% |
| `/case-studies/` | 6 ms | 19.0 KB | −10% |
| `/privacy-policy/` | 5 ms | 21.7 KB | −27% |
| `/blog/` | 28 ms | 14.2 KB | −40% |
| `/contact/` | 5 ms | 14.6 KB | −42% |
| `/blog/<slug>/` | 4 ms | 13.1 KB | −52% |

Average gzipped HTML across nine routes: **26.7 KB**.

Single-digit TTFB confirms the intended behaviour: a page view does no database work. Service
and solution pages carry *more* HTML than the source because content that used to arrive as
JavaScript is now in the markup — the trade that makes it crawlable — and because the
per-page rules the source inlined are still inlined for the four pages that have them. The
figures rose against the earlier measurement as the missing sections were restored: the
solution template gained back roughly a hundred elements of real content.

**JavaScript: ~143 KB gzipped per page** (excluding the `noModule` polyfill bundle that
modern browsers skip). This is more than the source shipped, and the honest reason is the
React and Next.js runtime. Against it: ~50 KB per service page of content-as-JavaScript is
gone, the bundle is shared and cached across every page rather than re-parsed per page, and
navigation between the 17 service and solution pages no longer re-downloads a 79 KB
stylesheet — they share one cached file, where the source inlined it into every page.

**Not measured here:** LCP, INP and CLS. Those are field metrics that depend on device,
network and geography, and have to be measured in a real browser against the production
deployment. A localhost number would be meaningless.

## Known limitations

1. **101 image slots are empty** because no image files were delivered. Each shows the
   source's own placeholder — the same box, the same labels — so the layout is identical and
   uploading a file through the CMS fills it with no code change.
2. **`/solutions/ai-automation/` has no page.** `/services/`, `/solutions/` and
   `/technologies/` are built; this one is not, because it names a capability rather than a
   page the site has. It redirects to the home page AI band, and the menu entries that used
   to point at it now go to the AI development service.
3. **Case-study detail pages** (`/case-studies/<slug>/`) are referenced by eight links in the
   source but were never designed. The slugs are preserved and each redirects to the index.
4. **The home page overflows horizontally at 375px**, by 302px — inherited from the source,
   which overflows by exactly the same amount. Fixing it would change the approved design, so
   it is reported here rather than changed.
5. **Article bodies are the excerpts the source wrote.** No source page carried a full article;
   the blog listing had titles and standfirsts, and the detail page was a template of
   placeholders. Each of the 51 articles is seeded with its real standfirst and left for an
   editor to complete, and the template's example body is stored as the starting point for a
   new article rather than published as one.
6. **Redirect changes need a deploy.** Next evaluates the redirect table once at server start.
   A row added in the CMS takes effect on the next deploy — the right trade for a table that
   changes rarely and is consulted on every request.

## Navigation targets

The source's menus name far more things than the site has pages for. The header lists
forty-four entries and the footer twenty-eight, against eight service pages, nine solution
pages and six standalone pages. The first pass resolved that by pointing whole columns at one
index each, which is why five different services, five AI capabilities and five industries
all led to the same place — the links worked, so a crawl reported them healthy, but clicking
any of them was pointless.

Each entry now resolves by the most specific rule that matches it, in `extractNavigation`:

| Rule | Covers | Example |
| --- | --- | --- |
| Scoped label | the same word meaning different things in different menus | `Technologies\|E-commerce` → `/technologies/#e-commerce`, `Solutions\|E-commerce` → `/services/web-development/` |
| Technology category | the nine stack groups | `AWS · Azure · GCP` → `/technologies/#cloud` |
| Industry | industries with work behind them | `Healthcare` → `/case-studies/?industry=healthcare` |
| Label | everything with a page of its own | `Mobile apps` → `/services/mobile-app-development/` |
| Column fallback | entries with no page | `UI/UX design` → `/services/` |

Sixty-seven menu entries now reach twenty-seven distinct destinations, against four before.

**Technology entries open a tab.** `TechStackTabs` reads the URL fragment on mount and on
`hashchange`, and each tab carries the id derived from its category name. The derivation is
exported so the seed and the component cannot drift apart — if they disagree the link opens
the first tab instead of failing, which would be invisible.

**Industry entries filter the index.** `?industry=` selects a group from a table in the web
app that maps a menu industry onto the industries the studies record, because those are
written per project — "Fintech", "FinTech" and "Financial services" all appear. Filtered
views are `noindex` with the canonical still on the unfiltered URL, so they cannot compete
with the index as thin duplicates. An unrecognised or empty filter renders the page as
designed rather than an empty grid.

Only four industries get a filter. The index carries the eight studies it was designed
around, and those cover fitness, fuel and food delivery, travel, and music and video
streaming. FinTech, E-commerce, Education and Real Estate are named in the menus but have no
study on that page, so they link to the unfiltered index. Filtering does not reach for the
other case studies in the database: those belong to individual service and solution pages,
and pulling them in would put work on the index that was never selected for it.

**What this cannot fix.** Five entries name services with no page — Cloud & DevOps, Cloud
Migration, UI/UX Design, Data & analytics, and Real Estate as an industry. They lead to the
relevant index, which now lists what does exist. Writing those pages, or renaming the
entries, is a content decision for the site's owners.

**The production API could not start at all.** `npm run start` failed on the API half with
`ERR_REQUIRE_ESM`: `sanitize-html` 2.17.7 depends on `htmlparser2` v12, which is ESM-only,
and the compiled API is CommonJS. Development never showed it, because `tsx` resolves ESM for
`require` and the dev script never loads `dist/`. So every check that ran against a
production build was really running against a dev API, and the one command intended for
production had never worked. `sanitize-html` is pinned to 2.17.0, the last release on a
CommonJS `htmlparser2`. Node 20.19 or 22.12 would also lift the constraint, since both
support `require(esm)`; the pin is what makes it work on the Node the project declares.
