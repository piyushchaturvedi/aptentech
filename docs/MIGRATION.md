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

### Redirects

| From | To | Code | Why |
| --- | --- | --- | --- |
| `/insights/` and `/insights/*` | `/blog/` | 301 | The footer on 24 of 25 pages linked here; no page existed. Canonicals all use `/blog/`. |
| `http://` | `https://` | 301 | Force TLS |
| `www.aptentech.com` | `aptentech.com` | 301 | Every canonical uses the apex host |
| no trailing slash | trailing slash | 308 | `trailingSlash: true` matches all 25 canonicals |

## Verification

### Content parity — 150 checks, 0 failures

`node scripts/verify-parity.js` compares every migrated route against its source file on
title, meta description, canonical, H1 and every section heading.

```
150 checks passed, 0 failed across 25 routes.
```

Service pages match at 21/21 headings, solution pages at 22/22. Where the migrated page
shows *more* headings than the source (the homepage at 13/12, legal pages at 18/17), it is
because content the source generated in the browser is now in the HTML.

Two documented exceptions:

- **`GEO pricing`** — the source ships `#cost{display:none!important}` to hide its pricing
  block. That was migrated to `hiddenSections` in the CMS, so the section is not rendered at
  all rather than rendered-then-hidden. Same visual result, and now editor-controllable.
- **`' + cs.title + '`** — a template literal inside the source's carousel renderer, which
  the checker sees as a heading. Not a real heading.

### Class names — every used class is styled

`node scripts/verify-classnames.js` lists any class a component uses that has no rule in the
migrated stylesheets. This catches the failure mode nothing else does: the stylesheets only
style the names the source used, so a component that invents one renders **unstyled** while
the content check still passes and the page looks broken.

```
Stylesheets define 452 class names.
Components use 206 class names.

PASS — every class the components use is styled by the migrated CSS.
```

It found 19 invented names on its first run, including one that mattered a lot: the case
study carousel used `cc-viewport` where the source puts `overflow: hidden` on `cc-view`. The
track — eight slides side by side — was therefore sizing the document, and **every service
and solution page scrolled horizontally**. Other finds: the solution pages' features are a
tab rail (`ftabs`/`fpanel`), not a card grid; the CTA band is `strip`/`strip-in`, not
`cta-band`; the positioning block is `intro`/`intro-body`; the compliance row is `comp-card`.

A separate bug surfaced from the same review: the honeypot field used the source's `.hp`
class, which is only defined in the contact page's stylesheet. On every other page it
rendered as a **visible empty input** — which looked broken and inverted the control, since
a real visitor filling it would have been scored as a bot. It is now hidden with inline
styles that cannot go missing.

### CSS parity — every source rule covered

`node scripts/verify-css.js` confirms that every one of the 1,119 distinct CSS rules across
the 25 source files is present in the stylesheets its page loads. The extraction copies
declarations verbatim; nothing was restyled.

```
PASS — every source rule is covered.
```

### Security — 31 checks, 0 failures

`node scripts/verify-security.js` probes the running system. See
[SECURITY.md](SECURITY.md).

### Lead pipeline and CMS — verified end to end

- A submitted lead reaches MongoDB with full attribution and appears in the admin
- A bot submission (honeypot + fast submit + disposable email + link spam) scores 230 and is
  quarantined as `SPAM` with an identical response
- Editing a service page's H1 in the CMS changes the live page **within seconds, with no
  redeploy**
- Uploading an image through the CMS replaces the placeholder on the public page; removing
  it restores the placeholder
- A disguised non-image is rejected by byte inspection; an SVG carrying `<script>` and
  `onload` is stored sanitised

## What the migration fixed

These were defects in the source, not choices:

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

**Broken links.** Footer Privacy Policy, Terms and Sitemap all pointed at `#` on all 25
pages; header "Contact" pointed at an on-page anchor rather than `/contact/`.

**The GEO page carried the AI-SEO page's `og:url` and breadcrumb**, which told search
engines they were the same page. Both now point at themselves.

**No `og:image` on 24 of 25 pages and a Twitter card on one.** Every page now emits both,
with per-page overrides in the CMS.

## Measured performance

Localhost, warm cache, production build:

| Route | TTFB | HTML (gzip) | vs source HTML |
| --- | --- | --- | --- |
| `/` | 9 ms | 26.3 KB | +22% |
| `/services/seo/` | 10 ms | 43.4 KB | +27% |
| `/case-studies/` | 5 ms | 9.2 KB | −55% |
| `/contact/` | 5 ms | 9.1 KB | −57% |
| `/blog/mobile-app-development-cost/` | 5 ms | 10.2 KB | −56% |

Average gzipped HTML across nine routes: **20.6 KB**.

Single-digit TTFB confirms the intended behaviour: a page view does no database work. Service
pages carry *more* HTML than the source because content that used to arrive as JavaScript is
now in the markup — the trade that makes it crawlable.

**JavaScript: ~143 KB gzipped per page** (excluding the `noModule` polyfill bundle that
modern browsers skip). This is more than the source shipped, and the honest reason is the
React and Next.js runtime. Against it: ~50 KB per service page of content-as-JavaScript is
gone, the bundle is shared and cached across every page rather than re-parsed per page, and
navigation between pages no longer re-downloads a 90 KB stylesheet.

**Not measured here:** LCP, INP and CLS. Those are field metrics that depend on device,
network and geography, and have to be measured in a real browser against the production
deployment. A localhost number would be meaningless.

## Known limitations

1. **Bespoke sections on five pages render with generic blocks.** The home, about, contact,
   case-studies and blog pages have layouts unique to them — the about page's values grid,
   the contact page's "what happens next" steps. Their content, headings and order are all
   preserved and editable, and parity passes on content, but a handful of these sections use
   a standard text block rather than a bespoke component. Pixel-perfect parity on those
   specific sections needs a dedicated component pass.
2. **101 image slots are empty** because no image files were delivered. Layout is unaffected.
3. **`/services/`, `/solutions/`, `/technologies/` and `/solutions/ai-automation/` are not
   built.** The menu links to them; no design exists. Building them means inventing a design,
   which was out of scope.
4. **Case study detail pages** (`/case-studies/<slug>/`) are referenced by eight links in the
   source but were never designed. The slugs are preserved so they can be built later without
   changing anything an editor has entered.
5. **No automated visual regression suite.** Parity is verified on content and CSS coverage,
   not on rendered pixels. A Playwright screenshot comparison against the original HTML would
   close that gap.
