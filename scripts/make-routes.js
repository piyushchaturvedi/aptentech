/** Generates the thin CMS-page route files. */
const fs = require('fs');
const path = require('path');

const APP = 'D:/Arpit/AptenTech/aptentech-platform/apps/web/src/app/(site)';

const routes = [
  { dir: '', slug: 'home', url: '/', css: 'home.css', crumb: null, title: 'Homepage' },
  { dir: 'about', slug: 'about', url: '/about/', css: 'about.css', crumb: 'About', title: 'About' },
  { dir: 'contact', slug: 'contact', url: '/contact/', css: 'contact.css', crumb: 'Contact', title: 'Contact' },
  { dir: 'privacy-policy', slug: 'privacy-policy', url: '/privacy-policy/', css: 'legal.css', crumb: 'Privacy Policy', title: 'Privacy Policy' },
  { dir: 'terms-conditions', slug: 'terms-conditions', url: '/terms-conditions/', css: 'legal.css', crumb: 'Terms & Conditions', title: 'Terms & Conditions' },
];

for (const r of routes) {
  const dir = r.dir ? path.join(APP, r.dir) : APP;
  fs.mkdirSync(dir, { recursive: true });

  const crumbArg = r.crumb ? `\n      breadcrumb={${JSON.stringify(r.crumb)}}` : '';

  const body = `import type { Metadata } from 'next';
import { CmsPage, cmsPageMetadata } from '@/components/sections/CmsPage';
import '@/styles/${r.css}';

/**
 * ${r.title} — \`${r.url}\`
 *
 * Content comes from the \`${r.slug}\` CMS page and is cached under its own tag, so
 * publishing an edit updates this route within seconds without a redeploy.
 */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return cmsPageMetadata('${r.slug}', '${r.url}');
}

export default function Page() {
  return (
    <CmsPage
      slug="${r.slug}"
      path="${r.url}"${crumbArg}
    />
  );
}
`;

  fs.writeFileSync(path.join(dir, 'page.tsx'), body, 'utf8');
  console.log('wrote', path.relative(APP, path.join(dir, 'page.tsx')) || 'page.tsx');
}
