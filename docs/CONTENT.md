# Using the CMS, and what content is still outstanding

## What an editor can and cannot change

**Can change** — every word on the site, plus:

- headings, standfirsts, body copy, button labels and their destinations
- services, solutions, case studies, blog articles, testimonials, FAQs
- which sections appear on a page, and in what order
- the mega-menu, the footer, contact details, social links
- redirects, so a path the old navigation promised can be repointed without a code change
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

Two places accept markup, both sanitised on the server when saved *and* again when read:

- **A blog article body**, against a profile that keeps what the article template styles —
  headings, paragraphs, lists, links, quotes, code, tables, images, the key-takeaway panel,
  the table wrapper, the pull quote, the inline call to action and anchored sections that the
  contents list links to. Everything else is stripped.
- **A legal document**, against a profile that keeps its clause sections, definition cards and
  numbering, because the privacy policy and terms are structured documents rather than prose.

Neither profile admits a class the stylesheet has no rule for, so no edit can produce markup
the design does not already cover.

### Content that belongs to one page

Case studies, testimonials and the "latest insights" cards look shared and are not: each
service, solution, home and about page ships its own, written for its subject. The taxi page
quotes driver onboarding, the fitness page quotes coaching. Editing a page's carousel or
testimonial grid changes that page only.

The card label above an article in a "latest insights" band is the page's, not the article's:
the about page calls one piece a *Guide* where the software page calls the same piece a *Cost
guide*. The article supplies the title, standfirst and link; the page supplies how it is
labelled and coloured there.

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

## Demo content and imagery

The site now ships populated. Every placeholder the source left behind has been filled with
demo data **in MongoDB**, and every image slot has an asset behind it. Nothing is hardcoded
into a component, so all of it is replaceable from the admin without a deploy.

Run `node scripts/verify-placeholders.js` against a running site to confirm none has crept
back: it crawls every page and reports only text a visitor would actually see, so a token
sitting in an unrendered template does not raise a false alarm. It currently reports **0
visible placeholders across 130 pages**.

### What was filled in, and how honestly

Three different kinds of placeholder needed three different answers.

**Configuration** — addresses, phone numbers, mailboxes — got deliberately obvious dummies:
`hello@example.com`, `+00 0000000000`, `Demo Street 1`. A plausible-looking fake would be
worse than an obvious one, because nobody would notice it shipping.

**Claims about the company** — awards, certifications, audit bodies, partner tiers, review
scores, client logos, registration numbers — got visibly generic labels: "Demo award", "Demo
certification", "Demo issuing body". They were never given realistic names. An invented
"ISO 27001 certified" would sit on the page looking entirely credible, and a visitor has no
way to tell it apart from a real credential. Market-size and growth figures render as an
em dash for the same reason: a statistic implies a source.

**Portfolio and quotes** — case-study metrics and testimonials — are filled so the design
reads as finished, and every seeded record carries `demoContent: true` so the admin can list
exactly what still needs replacing. Case studies get fictional product names (FoodFlow,
RideGo, FitTrack, StreamBox, TravelMate…) and metric values shaped to their own label — a
latency label gets a duration, a rate label a percentage — because a metric tile sized for
"38%" looks broken holding a dash. Testimonials name no invented person: each is
`Demo Client NN` with a real-sounding role and sector, which is what makes the section look
complete without putting words in a named individual's mouth.

> **Before launch.** The demo values are not publishable as-is. Filter the admin for
> `demoContent` records, replace every case-study metric with a verified figure, replace the
> testimonials with real quotes, and either fill in genuine awards and certifications or
> deactivate those sections.

### Images

The source referenced 82 images and none were delivered. Each slot now holds a generated SVG
at exactly the dimensions the slot records, stored through the ordinary media pipeline and
listed in `/admin/media` like any upload. Replacing one is a normal upload — no code change,
no redeploy.

They are abstract compositions in the site's own palette, not photographs, and that is a
deliberate choice rather than a limitation. Most of the slots are named `*-team.jpg` or
`aptentech-office.jpg`. A stock photograph of strangers captioned as AptenTech's team, or of
a building presented as its office, is a picture asserting something untrue about the
company — the same class of fabrication as an invented award, and harder to spot. Abstract
artwork fills the same space, carries the same visual weight, and is honestly what it is.

Three families are generated, chosen from the slot's recorded size: overlapping panels for
the team slots, a plotted series and node graph for the architecture and dashboard slots, and
a quieter geometric field for the 51 blog covers. Each is seeded from its own filename, so a
re-seed never repaints the site.

The logo, favicon and OG card are stored the same way and referenced from Settings, so the
brand assets are replaceable from `/admin/media` too.

### Search-engine metadata

Every page carries a canonical URL, a title and description, robots directives, an Open Graph
block and a Twitter card, all editable per page in the CMS with the site defaults as fallback.
Social and logo URLs are made absolute before they are emitted — a crawler fetches them from
its own context, so a site-relative path resolves against the wrong host and the card renders
blank.

Structured data is emitted server-side, from content that is actually on the page:

| Where | What |
| --- | --- |
| Every page | `Organization`, `WebSite` |
| Every page with a trail | `BreadcrumbList` |
| Service, solution, industry, technology | `Service`, plus `FAQPage` where the page has FAQs |
| The four index pages | `ItemList` naming each entry |
| Articles | `BlogPosting` with author, dates and cover image |

`Organization` deliberately omits any contact detail that is still a demo value. Structured
data is asserted to search engines as fact, so publishing `+00 0000000000` there would state
it as the company's real number. Fill the real details in under Settings and the properties
appear on their own.

`robots.txt` disallows `/admin` and `/api` and advertises the sitemap absolutely; the sitemap
lists all 115 public URLs, including every generated page.


### Editing the blog

`/admin/blog` follows the list-and-editor convention rather than the generic collection form
the other content types use, because managing fifty articles and writing one are different
jobs. The list has status tabs with live counts, a search box, bulk publish/draft/archive/delete,
and per-row Edit, View and Delete. The editor puts the article in the main column with the
publishing controls, category, tags, featured image and author in a sidebar.

The body is written through a toolbar — headings, bold, italic, lists, quotes, code and links —
with an HTML toggle for anyone who prefers markup. The toolbar produces only the tags the
article stylesheet already styles, and there is no way to type a class or a colour, so an
editor cannot introduce an element the design has no rules for. That is a convenience, not the
boundary: every save is still sanitised on the server against the same allowlist, and pasted
content is flattened to plain text on the way in.

The slug follows the title while you type and stops the moment you edit it yourself. Publishing
without a date fills in today, and leaving reading time at zero calculates it from the body.

### When a save is rejected

A failed save names the field and says what is wrong with it, one per line:

> Canonical URL: Link must be a site path, #anchor, http(s) URL, mailto:, tel:, or a placeholder

The API validates by field path — `seo.canonical`, `faqs.0.question` — and the admin maps
those to the labels on screen before showing them. Before this it showed only "Please check the
highlighted fields" with nothing highlighted, which gave an editor no way to find the field.

The one that catches people is **Canonical URL**. It is optional: leave it empty and the page
uses its own address. If you do fill it in, it has to be a path (`/blog/my-article/`) or a full
`https://` address — a bare word is refused, because a canonical that is not a URL silently
tells search engines the wrong thing about the page.

### Creating pages

`/admin/pages` → **Add new page** creates a page at any address the site does not already
use. It starts as a draft with three sections — a header, a body and a closing call to action —
all of them types the design already styles, and the address follows the title while you type.

The same dialog can place the page in the navigation: **Main menu (top level)** adds it beside
About and Contact, or pick a column inside a mega-menu to add it as a sub-entry. Deleting the
page removes its menu entry too, so a menu can never be left pointing at a page that no longer
exists.

Two guards worth knowing about, both of which prevent a page that saves cleanly and then
behaves oddly:

- **Reserved addresses are refused.** `services`, `about`, `admin` and the rest are real
  routes; Next resolves those before the catch-all, so a page created there would never render.
- **Core pages cannot be deleted.** The eleven built-in pages each have a route that reads them
  by slug — deleting the document would leave the route rendering nothing rather than removing
  a page. Clear its sections instead.

A page still in draft is hidden from the menus automatically, so adding it to the navigation
before it is finished does not put a 404 in the header.

Run `node scripts/verify-pages.js <admin-password>` to exercise the whole flow — create,
render, add to menu, edit, delete, and both guards.

### Verifying the round trip

`node scripts/verify-cms-flow.js <admin-password>` proves the claim that matters: it signs in
over the real HTTP surface, edits the home page hero, confirms the change appears on the
public site, restores it, and reads back every content collection. Nothing in it touches
MongoDB directly, so it cannot pass while the invalidation path is broken.


## What AptenTech still needs to supply

The placeholders below now hold **demo values**, not the original brackets — see the section
above for what was filled in and how. This list is what still needs a *real* value before the
site is published. Everything here is editable in the CMS.

### Contact details — highest priority

These appear in the footer of all 25 pages.

| Placeholder | Where |
| --- | --- |
| `[EMAIL ADDRESS]`, `[PHONE NUMBER]` | Settings → Company |
| `[REGISTERED OFFICE ADDRESS]`, `[CITY]`, `[OFFICE LOCATIONS]` | Settings → Company / Offices |
| `[GRIEVANCE EMAIL]`, `[PRIVACY EMAIL]`, `[LEGAL EMAIL]` | Pages → Privacy Policy / Terms |
| `[APTENTECH LEGAL ENTITY NAME]`, `[CIN NUMBER]`, `[GRIEVANCE OFFICER NAME]` | Pages → legal pages |

The footer now renders these as real `mailto:` and `tel:` links, because the demo values are
well-formed. That makes them tappable — and it makes replacing them before launch more
important, not less, since a visitor can now actually dial `+00 0000000000`.

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

### Images — every slot filled with generated artwork

None of the 82 referenced image files were delivered, so every slot now holds a generated SVG
at exactly the right dimensions (see "Demo content and imagery" above). The layout is correct
and dropping a real file in shifts nothing, because the replacement inherits the slot's
recorded size.

Replace them from `/admin/media` in roughly this order, by how much each is seen:

1. **Logo, favicon and the OG card** (Settings) — these carry the brand everywhere, including
   into every shared link
2. **Service and solution hero images** — 17 pages, 640×620 and 520×420
3. **Blog covers** — 51 articles at 760×520
4. Case-study screenshots and testimonial photos

Photographs of the team and the office are the ones worth commissioning first: those slots are
currently abstract artwork precisely because inventing them was not an option.

### Article bodies

No source page contained an article body. The listing gave titles and standfirsts; the detail
page was a template of placeholders. Each of the 51 articles is seeded with its real
standfirst as the body and needs writing out in the CMS.

The template's own example article — with its key-takeaway panel, table, pull quote and
inline call to action — is stored as the starting body for a new article, so a writer begins
from the structure the design was built for rather than a blank field.

Each article also carries an author name, role and bio, all still `[AUTHOR NAME]`-style
placeholders. The byline and the author box are both a ranking signal, so real, credited
authors are worth the effort before launch.

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

**Pages the menu promises that do not exist.** `/services/`, `/technologies/` and
`/solutions/ai-automation/` carried 864, 378 and 216 links respectively in the source, and
none of them was ever designed. They are not built, because doing so would mean inventing a
design. Each redirects to the band of the site that covers the same ground — `/#services`,
`/#tech`, `/#ai` — so no link is broken today. Either commission the pages and repoint the
redirect, or repoint the menu links themselves in Settings → Navigation.

Three more paths are in the same position: `/case-studies/all/` and the eight per-study
detail URLs the portfolio declared, and `/careers/` from the about page's hiring strip. Each
redirects to the nearest real page, and each study's slug is preserved so its page can be
built later without changing anything an editor has entered.

**The blog now has 51 articles, not 11.** Every service and solution page linked three of its
own, at real `/blog/<slug>/` addresses. Those are seeded with the title and standfirst the
source wrote and an empty body, exactly like the eleven on the listing — so the links work,
the copy is preserved, and the listing's pagination is real rather than the eight placeholder
pages the source hard-coded.
