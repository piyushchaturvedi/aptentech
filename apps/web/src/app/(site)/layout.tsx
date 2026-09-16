import type { Metadata } from 'next';
import type { SiteSettings } from '@aptentech/shared';
import { content } from '@/lib/api/content';
import type { ResolvedMedia } from '@/lib/api/content';
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
 * Removes menu entries an admin has switched off, and links pointing at a page that is not live.
 *
 * Two separate reasons an item should not render, resolved in one pass because they produce the
 * same outcome and the alternative is walking the same three structures twice.
 *
 *  - **Switched off in the admin.** `visible: false` hides a group, a column, a footer column or
 *    a single link without deleting it, so a section can be taken down and put back without
 *    anyone retyping its links. Absent means visible, so nothing stored before this existed
 *    disappears.
 *
 *  - **Pointing at a draft.** A page created in the CMS starts as a draft and can be added to a
 *    menu in the same moment, so without this the header would carry a link to a 404 until
 *    someone published it. Only hrefs that name a known `SitePage` are considered — a service
 *    page, the blog or an external URL is left exactly as configured, because this cannot tell
 *    whether an unknown path is broken or simply not a CMS page.
 *
 * A group that has been emptied by the filtering is dropped too: a mega-menu heading that opens
 * an empty panel reads as broken, and an admin who hides every column in a group has, in effect,
 * hidden the group.
 */
function visibleNavigation(settings: SiteSettings, unavailable: Set<string>): SiteSettings {
  const shown = (item: { visible?: boolean }) => item.visible !== false;
  const live = (link: { href: string }) => !unavailable.has(link.href);
  const keepLink = (link: { href: string; visible?: boolean }) => shown(link) && live(link);

  const navigation = settings.navigation
    .filter(shown)
    .map((group) => ({
      ...group,
      columns: group.columns.filter(shown).map((column) => ({ ...column, links: column.links.filter(keepLink) })),
    }))
    // A group with no columns is a direct link, and is kept only while its own target is live.
    .filter((group) =>
      group.columns.length ? group.columns.some((column) => column.links.length) : live(group),
    );

  return {
    ...settings,
    navigation,
    footerColumns: settings.footerColumns
      .filter(shown)
      .map((column) => ({ ...column, links: column.links.filter(keepLink) })),
    mobileNavigation: settings.mobileNavigation
      ?.filter(shown)
      .map((item) => ({ ...item, links: item.links.filter(keepLink) })),
    legalLinks: settings.legalLinks.filter(keepLink),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await content.settings();
  const url = (settings.favicon as ResolvedMedia | undefined)?.url;
  if (!url) return {};

  return {
    icons: {
      icon: [{ url }],
      shortcut: [{ url }],
      apple: [{ url }],
    },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [rawSettings, pages] = await Promise.all([content.settings(), content.pages()]);

  const unavailable = new Set(
    pages.filter((page) => page.custom && page.status !== 'PUBLISHED').map((page) => `/${page.slug}/`),
  );

  const settings = visibleNavigation(rawSettings, unavailable);

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
