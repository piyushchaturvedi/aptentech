import { BrandLoader } from '@/components/shared/BrandLoader';

/**
 * Shown while an admin screen is loading.
 *
 * This is where the loader actually earns its place. Admin pages are rendered on demand and
 * every one of them waits on the API — a lead list, a page's content, a media library — so
 * the gap is real and regular, unlike the site's prerendered pages.
 */
export default function AdminLoading() {
  return <BrandLoader label="Loading" />;
}
