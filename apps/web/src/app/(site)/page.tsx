import type { Metadata } from 'next';
import { CmsPage, cmsPageMetadata } from '@/components/sections/CmsPage';
import '@/styles/home.css';

/**
 * Homepage — `/`
 *
 * Content comes from the `home` CMS page and is cached under its own tag, so
 * publishing an edit updates this route within seconds without a redeploy.
 */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return cmsPageMetadata('home', '/');
}

export default function Page() {
  return (
    <CmsPage
      slug="home"
      path="/"
    />
  );
}
