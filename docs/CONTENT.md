# Using the CMS, and what content is still outstanding

## What an editor can and cannot change

**Can change** — every word on the site, plus:

- headings, standfirsts, body copy, button labels and their destinations
- services, solutions, case studies, blog articles, testimonials, FAQs
- which sections appear on a page, and in what order
- the mega-menu, the footer, contact details, social links
- images, alt text, logo, favicon
- per-page SEO: title, meta description, canonical, social share image, robots
- publish status and scheduling

**Cannot change** — the approved design:

- colours outside the six brand accents
- fonts, sizes, spacing, layout
- the icon set (choose from it; not add to it)
- arbitrary HTML or CSS
- which *types* of section exist

That separation is enforced in the data model, not by policy. Colours are stored as tokens
rather than hex values, icons as keys into a registry that ships with the code, and blocks
as a closed typed set. There is no free-form page builder, so no CMS edit can produce markup
the stylesheet does not already cover.

The one exception is a blog article body, which accepts a limited subset of HTML —
headings, paragraphs, lists, links, quotes, code, tables and images. It is sanitised on the
server when saved and again when read.

## Everyday tasks

**Publishing a change.** Edit, then Save & publish. The live page updates within a few
seconds — no rebuild, no deploy. Save a draft by setting the status to Draft instead.

**Uploading a missing image.** Go to the section holding the image slot; it shows the
original path and the exact dimensions the design expects. Upload, and the placeholder is
replaced on the next revalidation. Write the alt text while you are there — it describes the
image for screen readers and search engines.

**Managing leads.** Every enquiry lands under Leads with the page it came from, the campaign
that brought the visitor, and whether they asked for an NDA. Filter by status, change status
as you work the enquiry, and add notes. Export to CSV for a CRM.

Leads caught by the spam filter are stored under status `SPAM` rather than deleted — check
that filter occasionally, because a false positive is recoverable there and nowhere else.

**Changing navigation.** Settings → Navigation. Several menu links in the original still
point at placeholder paths such as `/services/` and `/technologies/`; repoint them here as
those pages are built.

## What AptenTech still needs to supply

The source pages are structurally complete but were seeded with placeholder content. None of
it was replaced with invented text — inventing a client name, a testimonial or a performance
figure would be worse than leaving the placeholder visible. Everything below is editable in
the CMS.

### Contact details — highest priority

These appear in the footer of all 25 pages.

| Placeholder | Where |
| --- | --- |
| `[EMAIL ADDRESS]`, `[PHONE NUMBER]` | Settings → Company |
| `[REGISTERED OFFICE ADDRESS]`, `[CITY]`, `[OFFICE LOCATIONS]` | Settings → Company / Offices |
| `[GRIEVANCE EMAIL]`, `[PRIVACY EMAIL]`, `[LEGAL EMAIL]` | Pages → Privacy Policy / Terms |
| `[APTENTECH LEGAL ENTITY NAME]`, `[CIN NUMBER]`, `[GRIEVANCE OFFICER NAME]` | Pages → legal pages |

Until these are real, the footer renders them as plain text rather than as clickable
`mailto:` or `tel:` links — a placeholder never becomes a broken link a visitor can tap.

The site currently has **no social media links**; the source had none. Add them in
Settings → Social links and they will appear in the footer and in the Organization
structured data.

### Statistics and results

`[VALUE]` appears 24 times, `[NUMBER]` 14, `[STAT VALUE]` twice. These are the case-study
metrics and the "Proven results, delivered at scale" band, whose seeded figures (250+
projects, 120+ clients, and so on) carry the source's own note: *"Placeholder metrics —
replace with verified Aptentech data before launch."*

The structured data deliberately omits anything unverified, so nothing false is published
to search engines while these stand.

### Client-facing content

- **`[PROJECT NAME]` (16)** — case study titles, plus `[MEASURABLE BUSINESS RESULT]` on each.
- **`[CLIENT NAME]`, `[ROLE]`, `[COMPANY]`** — the three testimonials are placeholder quotes
  from the source. Replace with approved, attributable statements.
- **`[AUTHOR NAME]` (10)** — blog bylines. The `ArticleSchema` skips the author field while
  it is a placeholder rather than publishing a fake byline.

### Images — 101 slots, none filled

The original referenced 37 images; none of the files were delivered, and the CMS now exposes
101 image slots in total across pages, case studies, articles, testimonials, logo and
favicon.

Every slot renders a placeholder at exactly the right dimensions, so the layout is already
correct and dropping the real file in shifts nothing. Priority order:

1. **Logo and favicon** (Settings) — currently drawn from the inline SVG mark
2. **Service and solution hero images** — 17 pages, 640×620 and 520×420
3. **Blog cover images** — 900×506 for articles, 760×520 for the featured card
4. **Social share images** — no page had one; they matter for how links look when shared
5. Case study screenshots, testimonial photos, client and partner logos

### Article bodies

The blog listing gave titles and standfirsts but no article bodies — the source never
contained them. Each post is seeded with its real excerpt as the body and needs writing out
in the CMS.

## Content decisions worth making

**`/insights/` vs `/blog/`.** The footer on 24 of 25 source pages linked to `/insights/`,
while every canonical and article link used `/blog/`. `/blog/` won because that is what the
canonicals declare; `/insights/` now 301-redirects there. Fine to leave, but worth a
deliberate confirmation.

**AI SEO and GEO overlap.** `/services/ai-seo/` and
`/services/generative-engine-optimization/` share 11 of 21 section headings, reference the
same two images, and have near-identical meta descriptions. The GEO page's `og:url` and
breadcrumb also pointed at the AI-SEO page in the source; both now point at themselves. They
will still compete with each other in search until the copy genuinely differentiates them —
or one is consolidated into the other with a redirect.

**Pages the menu promises that do not exist.** `/services/`, `/solutions/`,
`/technologies/` and `/solutions/ai-automation/` are linked from the mega-menu but were
never designed. They are not built, because doing so would mean inventing a design. Either
commission those pages or repoint the links in Settings → Navigation.
