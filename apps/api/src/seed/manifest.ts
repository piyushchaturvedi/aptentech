import type { ServiceKind } from '@aptentech/shared';

/**
 * Source file → production route.
 *
 * Filenames are not URLs. `aptentech-Portfolio.html` serves `/case-studies/`, and
 * `aptentech-homepage.html` serves `/`. Every route below was taken from the page's own
 * canonical tag, cross-checked against its `og:url` and breadcrumb JSON-LD during the
 * audit, so seeding preserves the indexed URL structure exactly.
 */

export interface ServiceSource {
  file: string;
  kind: ServiceKind;
  slug: string;
  name: string;
  order: number;
}

export const SERVICE_SOURCES: ServiceSource[] = [
  { file: 'aptentech-ai-development.html', kind: 'service', slug: 'ai-development', name: 'AI Development', order: 1 },
  { file: 'aptentech-software-development.html', kind: 'service', slug: 'software-development', name: 'Software Development', order: 2 },
  { file: 'aptentech-web-development.html', kind: 'service', slug: 'web-development', name: 'Web Development', order: 3 },
  { file: 'aptentech-mobile-app-development.html', kind: 'service', slug: 'mobile-app-development', name: 'Mobile App Development', order: 4 },
  { file: 'aptentech-digital-marketing.html', kind: 'service', slug: 'digital-marketing', name: 'Digital Marketing', order: 5 },
  { file: 'aptentech-seo.html', kind: 'service', slug: 'seo', name: 'SEO', order: 6 },
  { file: 'aptentech-ai-seo.html', kind: 'service', slug: 'ai-seo', name: 'AI SEO', order: 7 },
  {
    file: 'aptentech-generative-engine-optimization.html',
    kind: 'service',
    slug: 'generative-engine-optimization',
    name: 'Generative Engine Optimization',
    order: 8,
  },

  { file: 'aptentech-taxi-app-development.html', kind: 'solution', slug: 'taxi-app-development', name: 'Taxi App Development', order: 1 },
  { file: 'aptentech-food-delivery-app-development.html', kind: 'solution', slug: 'food-delivery-app-development', name: 'Food Delivery App Development', order: 2 },
  { file: 'aptentech-fuel-delivery-app-development.html', kind: 'solution', slug: 'fuel-delivery-app-development', name: 'Fuel Delivery App Development', order: 3 },
  { file: 'aptentech-alcohol-delivery-app-development.html', kind: 'solution', slug: 'alcohol-delivery-app-development', name: 'Alcohol Delivery App Development', order: 4 },
  { file: 'aptentech-dating-app-development.html', kind: 'solution', slug: 'dating-app-development', name: 'Dating App Development', order: 5 },
  { file: 'aptentech-fitness-app-development.html', kind: 'solution', slug: 'fitness-app-development', name: 'Fitness App Development', order: 6 },
  { file: 'aptentech-music-app-development.html', kind: 'solution', slug: 'music-app-development', name: 'Music App Development', order: 7 },
  { file: 'aptentech-video-streaming-app-development.html', kind: 'solution', slug: 'video-streaming-app-development', name: 'Video Streaming App Development', order: 8 },
  { file: 'aptentech-travel-app-development.html', kind: 'solution', slug: 'travel-app-development', name: 'Travel App Development', order: 9 },
];

export interface PageSource {
  file: string;
  slug: string;
  route: string;
  label: string;
}

/**
 * `blog-detail` is deliberately absent: it is a template full of `[POST TITLE]` and
 * `[POST-SLUG]` placeholders rather than a page, and it becomes the `/blog/[slug]/` route
 * rather than a CMS document.
 */
export const PAGE_SOURCES: PageSource[] = [
  { file: 'aptentech-homepage.html', slug: 'home', route: '/', label: 'Homepage' },
  { file: 'aptentech-about.html', slug: 'about', route: '/about/', label: 'About' },
  { file: 'aptentech-contact.html', slug: 'contact', route: '/contact/', label: 'Contact' },
  { file: 'aptentech-Portfolio.html', slug: 'case-studies', route: '/case-studies/', label: 'Case Studies' },
  { file: 'aptentech-blog.html', slug: 'blog', route: '/blog/', label: 'Blog' },
  { file: 'aptentech-privacy-policy.html', slug: 'privacy-policy', route: '/privacy-policy/', label: 'Privacy Policy' },
  { file: 'aptentech-terms-conditions.html', slug: 'terms-conditions', route: '/terms-conditions/', label: 'Terms & Conditions' },
];

export const TEMPLATE_SOURCES = [
  { file: 'aptentech-blog-detail.html', route: '/blog/[slug]/', label: 'Blog article template' },
];

/** All 25 source files, for the completeness assertion the seed runs at the end. */
export const ALL_SOURCE_FILES = [
  ...SERVICE_SOURCES.map((s) => s.file),
  ...PAGE_SOURCES.map((p) => p.file),
  ...TEMPLATE_SOURCES.map((t) => t.file),
];
