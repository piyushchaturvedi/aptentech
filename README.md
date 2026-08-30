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
| `scripts` | CSS extraction, parity verification, performance measurement. |
| `docs` | Architecture, deployment, security and content guides. |

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

Start both apps:

```bash
npm run dev
```

- Public site — <http://localhost:3000>
- Admin CMS — <http://localhost:3000/admin/login>
- API health — <http://localhost:4000/health>

---

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API and the web app together |
| `npm run dev:api` / `npm run dev:web` | Runs one of them |
| `npm run build` | Builds shared, API and web, in that order |
| `npm run start` | Runs both from their production builds |
| `npm run seed` | Re-imports content from the original HTML (idempotent) |
| `npm run create-admin` | Creates an admin account |
| `npm run typecheck` | Type-checks every workspace |
| `node scripts/verify-parity.js` | Compares all 25 migrated routes against the original HTML |
| `node scripts/verify-css.js` | Confirms no CSS rule was lost in extraction |
| `node scripts/verify-classnames.js` | Confirms every class a component uses is actually styled |
| `node scripts/verify-security.js <password>` | Probes the running system for its security controls |
| `node scripts/measure-performance.js` | Measures TTFB, HTML size and bundle size per route |

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
17 service and solution pages, 7 static pages, 8 case studies, 11 blog posts, testimonials,
FAQs, navigation, footer and SEO. It also regenerates
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
- [`docs/MIGRATION.md`](docs/MIGRATION.md) — how each of the 25 pages was migrated, and verification results
"# aptentech" 
