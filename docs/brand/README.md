# Brand assets

## favicon.svg

The logo mark, redrawn for small sizes.

A favicon is already configured — it is uploaded in **Admin → Settings → Favicon** and serves
correctly. What is wrong with it is optical, not technical: it is the header's mark copied at
its original weight, and at 16 pixels a 2.6-unit stroke on a 32-unit canvas lands on well
under one physical pixel. The browser renders it as a faint grey smear on indigo, so the tab
reads as a coloured square rather than as a mark.

This version thickens the stroke to 3.4 and enlarges the dot, which is the usual correction
when a logo is reused as an icon: the shape is the same, the weight is tuned for the size it
is actually displayed at.

**To use it:** Admin → Settings → Favicon → upload `favicon.svg`. That is deliberately a
manual step rather than something a deploy does. The favicon is content, and an editor who
has chosen one should not have a release quietly replace it.

The same artwork also ships as `apps/web/src/app/icon.svg`, which Next.js serves at `/icon.svg`
whenever no favicon is set in the CMS — so the brand is never missing from a tab, and an
upload still wins when there is one.
