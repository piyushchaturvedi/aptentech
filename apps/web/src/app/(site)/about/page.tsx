import type { Metadata } from 'next';
import { CmsPage, cmsPageMetadata } from '@/components/sections/CmsPage';
import '@/styles/about.css';

/**
 * About — `/about/`
 *
 * Content comes from the `about` CMS page and is cached under its own tag, so
 * publishing an edit updates this route within seconds without a redeploy.
 */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return cmsPageMetadata('about', '/about/');
}

export default function Page() {
  return (
    <CmsPage
      slug="about"
      path="/about/"
      breadcrumb={"About"}
    />
  );
}
