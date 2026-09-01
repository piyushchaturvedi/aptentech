# Architecture

## The boundary that matters

There are two applications and one database, and only one of the three can talk to the
database:

```
Browser ──▶ Next.js ──▶ Node.js API ──▶ MongoDB
```

Three things enforce that rather than merely describing it:

1. `apps/web/src/lib/api/client.ts` imports `server-only`. Importing it from a client
   component is a build error, so the service token cannot end up in browser JavaScript.
2. The API is the only package with a MongoDB driver dependency. The web app has none.
3. Every API route requires either the service token (public reads) or an admin session
   (writes). There is no unauthenticated path to data.

## Request paths

**A visitor loading a page** does not reach the database at all:

```
Visitor → CDN → Next.js ISR cache → (miss only) → API → MongoDB
```

Pages are statically generated at build and revalidated on an interval *and* on publish.
A warm request is served from cache in single-digit milliseconds because no server work
happens.

**A visitor submitting a form** takes the only public write path:

```
Browser → /api/leads/ (Next route) → API → validate → spam checks → MongoDB → admin
```

The Next.js route attaches the visitor's IP and user agent server-side, so attribution
cannot be forged by the client.

**An admin editing content**:

```
Admin UI → /api/admin/... (Next proxy) → API → MongoDB
                                          └─▶ signed webhook → Next revalidateTag → live
```

The proxy exists so the browser stays same-origin: the session cookie can remain
`SameSite=Lax`, and the service token stays on the server.

### Connections between the two apps

Every arrow above that crosses from Next.js to the API is an HTTP request over a pooled,
kept-alive socket, and that pooling has one failure mode worth stating explicitly. Node
closes an idle keep-alive connection after five seconds by default, while the calling side
still believes it is usable; a request that picks up such a socket fails with `ECONNRESET`
before a byte is sent. The visible symptom is a page that errors once and then works on
reload, which reads as a broken link rather than as a transport problem.

Two things prevent it. The API holds connections open for 65 seconds — longer than any
caller keeps one — so the client is always the side that closes, and the race has no window
to occur in. Both callers then retry a connection that never completed, which also covers
the case where the API is still binding its port during a cold `npm run dev`.

The retry is restricted to reads. A request that dies mid-flight may still have been applied
upstream, so replaying a write could create a second session or a duplicate record; writes
get one attempt and surface an honest error. An HTTP status is the API answering and is
never retried — only a connection that produced no response at all.

## Content model

Two shapes cover the whole site.

**`servicePages`** — one collection for both services and solutions, with a `kind`
discriminator. The audit measured their stylesheets as 96–100% identical and their section
order as the same 21–22 blocks, so one document shape, one renderer and one admin form
serve all 17 pages. `kind` decides only the URL prefix. Real differences survive as optional
sections: solutions have `marketContext`, and `featuresLayout` distinguishes the service
pages' chip grid from the solution pages' grouped cards.

**`pages`** — the seven statically-routed pages (home, about, contact, case studies, blog
landing, and the two legal pages), each a list of typed blocks.

Page bodies are **embedded, not referenced**. A service document carries its own hero,
features, process, tech stack and FAQs, so rendering a page is one query with no joins and
no N+1. The arrays are bounded — the largest in the source held 28 items — so the 16 MB
document ceiling is not a concern. Only genuinely shared many-to-many content
(testimonials, case studies) is referenced by id, because the same testimonial appears on
several pages and must be edited once.

### Collections and indexes

| Collection | Key indexes | Why |
| --- | --- | --- |
| `servicePages` | `{kind, slug}` unique, `{kind, status, order}` | Fetch one page; list a family in order |
| `pages` | `{slug}` unique | Fetch one page |
| `caseStudies` | `{slug}` unique, `{status, featured, order}` | Listing and the carousel |
| `blogPosts` | `{slug}` unique, `{status, publishedAt}`, `{status, tags, publishedAt}`, text index | Listing, tag pages, admin search |
| `testimonials` | `{visible, order}`, `{attachedTo, visible}` | Ordered display; per-page attachment |
| `faqs` | `{attachedTo, visible, order}` | Per-page FAQ rails |
| `leads` | `{status, createdAt}`, `{email, createdAt}`, `{fingerprint, createdAt}` | Triage, history, duplicate detection |
| `adminUsers` | `{email}` unique | Sign-in |
| `sessions` | `{tokenHash}` unique, TTL on `expiresAt` | Lookup; Mongo expires them itself |
| `media` | `{key}` unique, `{createdAt}`, text index | Library and search |
| `auditLogs` | `{createdAt}`, `{adminId, createdAt}`, 365-day TTL | Admin history that expires on its own |

No index exists without a query that uses it. Indexes are created at boot via
`syncIndexes()`, so a bad definition fails loudly instead of silently degrading a query
into a collection scan.

## Design lock

The approved design is developer-controlled; content is admin-controlled. Three decisions
enforce that:

**Colours are tokens, not values.** The source stored literal hex (`c:'#3A31DB'`). The CMS
stores one of six accent tokens. An editor picks from the brand palette and cannot enter an
arbitrary colour.

**Icons are keys, not markup.** The source stored raw inline SVG (`i:'<path d="..."/>'`).
The CMS stores a key into `iconRegistry.generated.ts`, which ships with the code. This keeps
the icon set under design control and removes what would otherwise be a stored-XSS sink.

**Blocks are a closed set.** There is no raw-HTML block and no general page builder. An
editor picks from the typed blocks the design already has and fills their fields, so no CMS
edit can produce markup the stylesheet does not cover. Adding a block type is a code change,
by design.

The one place editors produce markup is a blog article body, which is sanitised server-side
against a narrow allowlist — on write *and* again on read.

## CSS

The 25 source files carried ~2.2 MB of inline CSS between them, which resolved to 1,119
distinct rules. `scripts/extract-css.js` splits those **by page family, never inside one**:

- `site.css` — a service page's complete stylesheet, in source order (79 KB), shared by all
  17 service and solution pages
- `solution.css` — what all nine solution pages add on top (1.7 KB)
- `pageExtras.generated.ts` — what a single page adds beyond that (0–7.4 KB), rendered in
  that page's own `<style>`
- `home.css`, `about.css`, `portfolio.css`, `blog.css`, `blog-detail.css`, `contact.css`,
  `legal.css` — each the complete stylesheet of its page, in source order

Splitting *within* a page is what an earlier version did, and it broke the cascade twice: a
page rule always lands after every shared rule, even where the source had a shared rule
after it, and merging one page's extras with another's put the dating page's pink treatment
on the other eight solution pages. Both were caught by the layout comparison, not by any
check on content. Keeping each page's sheet whole makes the class of bug impossible.

Every declaration is copied verbatim. `scripts/verify-css.js` confirms that every rule in
every source page is covered by the stylesheets that page loads, including the inline tails —
it reports **every source rule covered**.

Fonts moved from Google Fonts to `next/font`, which self-hosts the same faces. That removes
a third-party round trip from the critical path and lets the CSP drop `fonts.googleapis.com`
entirely.

## Caching and invalidation

| Content | Strategy | Interval | Tag |
| --- | --- | --- | --- |
| Home, about, contact, legal | Static + ISR | 1 hour | `page:<slug>` |
| Service / solution pages | SSG + ISR | 1 hour | `service:<slug>` / `solution:<slug>` |
| Blog listing and articles | SSG + ISR | 15 min | `blog`, `post:<slug>` |
| Case studies | Static + ISR | 1 hour | `case-studies` |
| Header / footer / nav | Layout-level cache | On demand | `settings` |
| Admin | Always dynamic, `no-store` | — | — |

On publish, the API calls a signed webhook on Next.js which drops exactly the affected tags.
The webhook is authenticated with an HMAC over the request body and rejects anything older
than five minutes — an unauthenticated revalidation endpoint would let anyone force cache
misses and push load straight through to MongoDB.

**Verified**: editing a service page's H1 in the CMS changes the live page within seconds,
with no redeploy.

## What runs on the client

Server Components by default. These are the only client components, and each one has state
that genuinely requires it:

`ServicesPanel`, `FeatureChips`, `ProcessTimeline`, `TechStackTabs`, `CaseCarousel`,
`FaqAccordion`, `StatCounters`, `ScrollReveal`, `MobileNav`/`HeaderInteractions`, and the
three lead forms.

All of them are still server-rendered — Next emits their markup into the HTML response, so
their content is in the document for crawlers and readable without JavaScript. That is the
opposite of the source, where these sections did not exist until a script ran.
