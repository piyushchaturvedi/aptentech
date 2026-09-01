import { content } from '@/lib/api/content';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Analytics } from '@/components/layout/Analytics';

/**
 * Public site shell.
 *
 * Header and footer are rendered here from CMS settings and cached under the `settings`
 * tag, so the whole site picks up a navigation or contact change the moment an admin
 * publishes — no redeploy, and one fetch rather than one per page.
 *
 * The skip link is the first focusable element, matching the source markup.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await content.settings();

  return (
    <>
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
