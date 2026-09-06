# AptenTech platform

The AptenTech website and admin CMS, migrated from 25 static HTML pages onto Next.js,
a Node.js REST API and MongoDB.

```
                         aptentech.com
                              │
                              ▼
                    ┌───────────────────┐
                    │      Next.js      │   apps/web
                    │  Public website   │   public site + admin CMS
                    │        +          │
                    │     Admin CMS     │
                    └─────────┬─────────┘
                              │ HTTPS, server-to-server
                              ▼
                    ┌───────────────────┐
                    │   Node.js API     │   apps/api
                    │     REST only     │   the only thing that talks to MongoDB
                    └─────────┬─────────┘
                              ▼
                        ┌───────────┐
                        │  MongoDB  │
                        └───────────┘
```

The browser never receives MongoDB credentials, never contacts MongoDB, and never holds
the API service token. `apps/web/src/lib/api/client.ts` is marked `server-only`, so any
attempt to import it from a client component fails the build — the boundary is enforced by
the compiler, not by convention.

---

## What is here

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js 15 (App Router). Public site under `app/(site)`, admin CMS under `app/admin`. |
| `apps/api` | Node.js + Express REST API. Routes → controllers → services → repositories → MongoDB. |
| `packages/shared` | Types and zod schemas used by both, so the two cannot drift apart. |
| `scripts` | CSS extraction, and the checks that prove the migration: structure, layout, links, CSS coverage, security, performance. |
| `docs` | Architecture, deployment, security and content guides. `SERVER-SETUP.md` is the step-by-step EC2 install. |

---

## Prerequisites

- **Node.js 20.10+**
- **MongoDB 5.0+** — running locally, or a MongoDB Atlas connection string
- The original 25 HTML files, for seeding. They are read from the parent directory by
  default; set `SOURCE_HTML_DIR` if they live elsewhere.

---

## Getting started

```bash
npm install
```

```bash
cp .env.example .env
```

Generate real secrets — the file ships with placeholders that the API refuses to start
with in production:

```bash
node -e "const c=require('crypto');console.log('API_SERVICE_TOKEN='+c.randomBytes(32).toString('base64url'));console.log('SESSION_SECRET='+c.randomBytes(32).toString('base64url'));console.log('REVALIDATE_SECRET='+c.randomBytes(24).toString('base64url'))"
```

Paste those three values into `.env`, then copy it where each app reads it:

```bash
cp .env apps/api/.env && cp .env apps/web/.env.local
```

Build the shared package (both apps import it):

```bash
npm run build --workspace @aptentech/shared
```

Load the site's content from the original HTML:

```bash
npm run seed
```

Create the first admin account. The password is generated and printed once; it is never
stored in plain text and must be changed at first sign-in:

```bash
npm run create-admin -- --email you@aptentech.com --name "Your Name" --role SUPER_ADMIN
```

Copy that password somewhere safe before closing the terminal — it is stored only as a hash
and cannot be read back. If it is lost, or nobody can sign in, this issues a new one and
signs out every existing session:

```bash
npm run reset-admin-password -- --email you@aptentech.com
```

Start both apps:

```bash
npm run dev
```

That one command runs **both** apps, each on its own port, with their output interleaved and
labelled `[api]` / `[web]`. Stopping it stops both.

| | URL |
| --- | --- |
| Public site | <http://localhost:3000> |
| Admin CMS | <http://localhost:3000/admin> |
| API | <http://localhost:4000/health> |

`/admin` is the only address you need to remember: it forwards to the dashboard, and sends
you to the sign-in form first if you are not signed in. On the very first sign-in the CMS
requires you to choose a new password before it will let you in.

The site cannot render without the API — every page reads its content from it — so if pages
come up blank, check that the `[api]` half printed `AptenTech API listening`.

> **`EADDRINUSE: address already in use :::3000`.** Both ports are fixed, so a server left
> running from an earlier session still holds one of them. Because `concurrently` stops the
> other half as soon as one fails, the whole command exits and neither app comes up. Free the
> ports and start again:
>
> ```bash
> npm run stop
> ```
>
> It reports every process it stops, so nothing is killed silently. Closing a terminal does
> not always stop what it started, which is why this happens more often than it should.
>
> **`Cannot find module for page: /…` during a build.** The named page is fine; the build
> output is not. `next dev` and `next build` share `.next` and fill it differently, so a
> build that reads a dev server's leftovers fails part way through and blames a page at
> random. `npm run build` now clears the directory first, so this should only appear if a dev
> server is running *while* you build — stop it with `npm run stop` and build again.

---

## Running the production build

`npm run dev` compiles pages on demand, which is convenient but slow and occasionally flaky.
To run the site the way it is actually served, build it once and start both apps:

```bash
npm run build
```

```bash
npm run start
```

`npm run start` runs the API and the web app together on the same two ports as `npm run dev`
— <http://localhost:3000> and <http://localhost:4000> — with output labelled `[api]` / `[web]`.
Stopping it stops both.

Two things about the build worth knowing:

- **Start the API first, or build with it stopped and accept the fallback.** The build asks
  the API for the redirect table. If it cannot reach it, the build still succeeds but prints
  `[redirects] API unreachable — using the compiled-in fallback list` and ships only the
  redirects compiled into `next.config.mjs`, leaving out any an administrator added in the
  CMS. `npm run dev` in `apps/api` beforehand is enough.
- **Rebuild after changing content.** Pages are prerendered at build time, so edits made in
  the CMS reach a running production server through revalidation, but a fresh build is what
  regenerates the static HTML.

---

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API and the web app together |
| `npm run dev:api` / `npm run dev:web` | Runs one of them |
| `npm run stop` | Frees ports 3000 and 4000 when a previous run is still holding them |
| `npm run deploy:prod` | **The only deployment command.** Validates env, builds, restarts PM2, reloads nginx, verifies |
| `npm run prod:env:check` | Validates the production environment without changing it |
| `npm run preflight` | Pre-deployment check: config, build output and content that must not ship |
| `npm run clear-demo` | Hides the demo awards, testimonials and metrics (add `-- --apply`) |
| `npm run build` | Builds shared, API and web, in that order |
| `npm run start` | Runs both from their production builds |
| `npm run seed` | Re-imports content from the original HTML (idempotent) |
| `npm run create-admin` | Creates an admin account |
| `npm run reset-admin-password` | Resets a password when nobody can sign in |
| `node scripts/verify-crm.js` | End-to-end check of the lead CRM and email (both apps must be running) |
| `npm run typecheck` | Type-checks every workspace |
| `node scripts/verify-placeholders.js` | Crawls the site for placeholder text a visitor would see |
| `node scripts/verify-cms-flow.js <password>` | Proves an admin edit reaches the public site without a deploy |
| `node scripts/verify-pages.js <password>` | Creates, renders, menus, edits and deletes a CMS page end to end |
| `node scripts/verify-parity.js` | Compares all 25 migrated routes against the original HTML on title, description, canonical and every heading |
| `node scripts/verify-links.js` | Crawls the built site and reports dead links, `#` links and broken anchors |
| `node scripts/verify-css.js` | Confirms no CSS rule was lost in extraction |
| `node scripts/verify-classnames.js` | Confirms every class a component uses is actually styled |
| `node scripts/verify-security.js <password>` | Probes the running system for its security controls |
| `node scripts/measure-performance.js` | Measures TTFB, HTML size and bundle size per route |
| `node scripts/extract-css.js` | Regenerates the stylesheets from the original HTML |
| `node scripts/parity-report.js` | Diffs captured DOM structures, original against migration |
| `node scripts/layout-report.js` | Diffs captured layouts — boxes and computed styles — at each width |

### Comparing against the original pages

The structure and layout reports work on captures taken in a real browser, because the
source pages build most of their sections in JavaScript and the file on disk is missing
exactly the parts worth comparing.

```bash
node scripts/serve-original.js          # serves the 25 source files on :8080
```

Then, in a browser on each page in turn:

```js
await import('http://localhost:8080/sig.js?n=o-taxi-app-development')     // the original
await import('http://localhost:8080/layout.js?n=lo-o-taxi-1440')          // at this width
```

…and the same with `m-` / `lo-m-` names on the migrated page. Captures land in `.parity/`;
`parity-report.js` and `layout-report.js` diff every pair they find.

> **Rebuilding after a content change.** Next.js caches API responses on disk between
> builds. After re-seeding, clear that cache or the build will reuse the previous data:
>
> ```bash
> rm -rf apps/web/.next/cache/fetch-cache && npm run build --workspace @aptentech/web
> ```
>
> This only affects builds. At runtime the CMS invalidates caches itself, so an editor
> never needs to rebuild.

---

## Seeding

`npm run seed` reads the 25 original HTML files and loads their real content into MongoDB:
17 service and solution pages, 7 static pages, 81 case studies, 51 articles, 52 testimonials,
FAQs, navigation, footer, redirects and SEO. Most of those collections are larger than they
look from the page count, because each page ships its own — the taxi page's case studies are
not the SEO page's, and attaching one shared set to all of them was how the first pass lost
roughly 150 entries. It also regenerates
`apps/web/src/components/shared/iconRegistry.generated.ts` from the exact SVG the source
used, which is what keeps the icon set identical.

The seed is idempotent — every write is an upsert keyed on slug, so re-running updates in
place rather than duplicating.

**Placeholders are preserved deliberately.** The source is full of them — `[VALUE]` appears
243 times, `[CLIENT NAME]` 57 times, and the contact details are `[EMAIL ADDRESS]` and
`[PHONE NUMBER]`. None of it is replaced with invented content; it is carried across as-is
and is editable in the CMS. See [`docs/CONTENT.md`](docs/CONTENT.md) for the list of what
AptenTech still needs to supply.

---

## Environment variables

Every variable is documented inline in `.env.example`. The ones that matter most:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | The only place the database is addressed. Never reaches a browser. |
| `API_SERVICE_TOKEN` | Presented by the Next.js **server** on every API call. Never sent to a client. |
| `SESSION_SECRET` | Signs admin sessions. Rotating it signs everyone out. |
| `REVALIDATE_SECRET` | HMAC for the cache-invalidation webhook. |
| `NEXT_PUBLIC_SITE_URL` | Canonical host. Keep as `https://aptentech.com` in **every** environment, or a staging deploy will publish canonicals pointing at staging. |
| `MEDIA_DRIVER` | `local` for development, `s3` for production. The API refuses to start in production with `local`. |

The API validates its environment at boot and exits with a readable message rather than
starting half-configured.

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit, the data model, caching
- [`docs/SECURITY.md`](docs/SECURITY.md) — the security model and what was verified
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — AWS deployment and cost control
- [`docs/CONTENT.md`](docs/CONTENT.md) — using the CMS, and what content is still outstanding
- [`docs/CRM.md`](docs/CRM.md) — lead conversations, email templates, delivery and inbound replies
- [`docs/MIGRATION.md`](docs/MIGRATION.md) — how each of the 25 pages was migrated, and verification results
"# aptentech" 
