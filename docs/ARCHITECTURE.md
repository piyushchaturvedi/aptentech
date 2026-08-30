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
distinct rules. `scripts/extract-css.js` splits those into:

- `base.css` — 391 rules present on all 25 pages
- `service.css` / `solution.css` — the shared service template
- `home.css`, `about.css`, `portfolio.css`, `blog.css`, `blog-detail.css`, `contact.css`, `legal.css`

Every declaration is copied verbatim. `scripts/verify-css.js` confirms that every rule in
every source page is covered by the stylesheets that page loads — it currently reports
**every source rule covered**, with one documented exception (see MIGRATION.md).

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
