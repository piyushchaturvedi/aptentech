import type { Metadata } from 'next';
import { CmsPage, cmsPageMetadata } from '@/components/sections/CmsPage';
import '@/styles/legal.css';

/**
 * Privacy Policy — `/privacy-policy/`
 *
 * Content comes from the `privacy-policy` CMS page and is cached under its own tag, so
 * publishing an edit updates this route within seconds without a redeploy.
 */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return cmsPageMetadata('privacy-policy', '/privacy-policy/');
}

export default function Page() {
  return (
    <CmsPage
      slug="privacy-policy"
      path="/privacy-policy/"
      breadcrumb={"Privacy Policy"}
    />
  );
}
