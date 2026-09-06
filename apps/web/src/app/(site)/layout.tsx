import type { SiteSettings } from '@aptentech/shared';
import { content } from '@/lib/api/content';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Analytics } from '@/components/layout/Analytics';
import { OrganizationSchema, WebSiteSchema } from '@/lib/seo/structuredData';

/**
 * Public site shell.
 *
 * Header and footer are rendered here from CMS settings and cached under the `settings`
 * tag, so the whole site picks up a navigation or contact change the moment an admin
 * publishes — no redeploy, and one fetch rather than one per page.
 *
 * The skip link is the first focusable element, matching the source markup.
 */
/**
 * Removes navigation links pointing at a page that is not live.
 *
 * A page created in the CMS starts as a draft, and the admin can add it to a menu at the same
 * moment — so without this the header would carry a link to a 404 until someone published it.
 * The same guard covers a page later unpublished or deleted outside the admin flow.
 *
 * Only hrefs that name a known CMS page are considered. Everything else — service pages, the
 * blog, an external URL — is left exactly as configured, because this cannot tell whether an
 * unknown path is broken or simply not a `SitePage`.
 */
function hideUnpublished(settings: SiteSettings, unavailable: Set<string>): SiteSettings {
  if (unavailable.size === 0) return settings;

  const keep = (link: { href: string }) => !unavailable.has(link.href);

  return {
    ...settings,
    navigation: settings.navigation
      .filter((group) => group.columns.length > 0 || keep(group))
      .map((group) => ({ ...group, columns: group.columns.map((c) => ({ ...c, links: c.links.filter(keep) })) })),
    footerColumns: settings.footerColumns.map((column) => ({ ...column, links: column.links.filter(keep) })),
    mobileNavigation: settings.mobileNavigation?.map((item) => ({ ...item, links: item.links.filter(keep) })),
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [rawSettings, pages] = await Promise.all([content.settings(), content.pages()]);

  const unavailable = new Set(
    pages.filter((page) => page.custom && page.status !== 'PUBLISHED').map((page) => `/${page.slug}/`),
  );

  const settings = hideUnpublished(rawSettings, unavailable);

  return (
    <>
      {/*
        Site-wide structured data, emitted once from the shell.

        `Organization` and `WebSite` describe the site rather than any one page, so they belong
        here — a per-page copy would repeat the same block on 130 pages. Both were written
        during the migration and never rendered, which meant search engines saw no publisher
        identity for the site at all.
      */}
      <OrganizationSchema settings={settings} />
      <WebSiteSchema settings={settings} />

      <a className="skip" href="#main">
        Skip to main content
      </a>
      <SiteHeader settings={settings} />
      <main id="main">{children}</main>
      <SiteFooter settings={settings} />
      <Analytics config={settings.analytics} />
    </>
  );
}
