import { BrandLoader } from '@/components/shared/BrandLoader';

/**
 * Shown while a site route is still loading.
 *
 * Most pages here are prerendered and arrive fast enough that this never appears, which is
 * the intended outcome — it exists for the ones that do not: a blog listing behind a slow
 * query, a first visit on a poor connection, a cold page after a deploy.
 *
 * It sits inside the site layout, so the header and footer stay put and only the page area
 * is replaced. Navigation keeps working while it shows.
 */
export default function SiteLoading() {
  return <BrandLoader />;
}
