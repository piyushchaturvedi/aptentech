import type { BlogPost, FaqItem, SiteSettings } from '@aptentech/shared';
import { absoluteUrl } from './metadata';

/**
 * Structured data.
 *
 * Rendered on the server, into the HTML response. The source built its FAQ schema in the
 * browser and injected it into an empty `<script>` tag, which makes it materially less
 * reliable for rich results; this is the fix, and it costs nothing visually.
 *
 * Every emitter here derives its values from content that is actually visible on the page.
 * Nothing is fabricated — a page with no FAQs emits no FAQPage.
 */

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Values come from our own CMS, and `<` is escaped so a stray sequence in copy cannot
      // close the script element early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export function OrganizationSchema({ settings }: { settings: SiteSettings }) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.companyName,
    url: absoluteUrl('/'),
  };

  // Placeholder contact details are omitted rather than published as if real.
  const isPlaceholder = (v: string) => /^\[.*\]$/.test(v.trim());
  if (settings.email && !isPlaceholder(settings.email)) data.email = settings.email;
  if (settings.phone && !isPlaceholder(settings.phone)) data.telephone = settings.phone;
  if (settings.logo?.url) data.logo = settings.logo.url;
  if (settings.socials.length) data.sameAs = settings.socials.map((s) => s.href).filter((h) => /^https?:/.test(h));

  return <JsonLd data={data} />;
}

export function WebSiteSchema({ settings }: { settings: SiteSettings }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: settings.companyName,
        url: absoluteUrl('/'),
      }}
    />
  );
}

export function BreadcrumbSchema({ trail }: { trail: Array<{ name: string; path: string }> }) {
  if (trail.length < 2) return null;
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((crumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.name,
          item: absoluteUrl(crumb.path),
        })),
      }}
    />
  );
}

export function ServiceSchema({
  name,
  description,
  path,
  settings,
}: {
  name: string;
  description: string;
  path: string;
  settings: SiteSettings;
}) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Service',
        name,
        description,
        url: absoluteUrl(path),
        provider: { '@type': 'Organization', name: settings.companyName, url: absoluteUrl('/') },
      }}
    />
  );
}

/**
 * FAQPage.
 *
 * Only emitted for FAQs that are actually rendered on the page, so the markup and the
 * schema cannot drift apart — which is the requirement for this to be valid.
 */
export function FaqSchema({ faqs }: { faqs: FaqItem[] }) {
  const visible = faqs.filter((f) => f.visible !== false && f.question && f.answer);
  if (!visible.length) return null;

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: visible.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      }}
    />
  );
}

export function ArticleSchema({ post, settings }: { post: BlogPost; settings: SiteSettings }) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    url: absoluteUrl(`/blog/${post.slug}/`),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(`/blog/${post.slug}/`) },
    publisher: { '@type': 'Organization', name: settings.companyName },
  };

  if (post.publishedAt) data.datePublished = post.publishedAt;
  if (post.updatedAt) data.dateModified = post.updatedAt;

  // The seeded author is the source's `[AUTHOR NAME]` placeholder; publishing that as a
  // real byline would be misleading structured data.
  if (post.authorName && !/^\[.*\]$/.test(post.authorName)) {
    data.author = { '@type': 'Person', name: post.authorName };
  }
  if (post.coverImage && 'url' in post.coverImage && post.coverImage.url) {
    data.image = post.coverImage.url;
  }

  return <JsonLd data={data} />;
}

export function CollectionPageSchema({ name, description, path }: { name: string; description: string; path: string }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name,
        description,
        url: absoluteUrl(path),
      }}
    />
  );
}
