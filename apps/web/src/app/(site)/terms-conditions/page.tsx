import type { Metadata } from 'next';
import { CmsPage, cmsPageMetadata } from '@/components/sections/CmsPage';
import '@/styles/legal.css';

/**
 * Terms & Conditions — `/terms-conditions/`
 *
 * Content comes from the `terms-conditions` CMS page and is cached under its own tag, so
 * publishing an edit updates this route within seconds without a redeploy.
 */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return cmsPageMetadata('terms-conditions', '/terms-conditions/');
}

export default function Page() {
  return (
    <CmsPage
      slug="terms-conditions"
      path="/terms-conditions/"
      breadcrumb={"Terms & Conditions"}
    />
  );
}
