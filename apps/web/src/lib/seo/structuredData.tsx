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

  /*
    Demo and placeholder values are omitted rather than published.

    Structured data is read by machines and surfaced in search results as fact, so a demo
    phone number here would be asserted to Google as the company's real one. The bracket form
    is the source's placeholder; the `example.com` and `+00` forms are the demo values the
    seed writes. None of them is publishable, and leaving the property out is honest — a
    partial Organization block is valid, a wrong one is not.
  */
  const unusable = (v: string) => {
    const s = v.trim();
    return !s || /^\[.*\]$/.test(s) || /example\.com$/i.test(s) || s.startsWith('+00') || /^Demo /i.test(s);
  };

  if (settings.email && !unusable(settings.email)) data.email = settings.email;
  if (settings.phone && !unusable(settings.phone)) data.telephone = settings.phone;
  /*
    Absolute, because structured data is read away from the page it came from.

    The local media driver returns a site-relative path, and a consumer resolving that against
    its own host would fetch nothing. `absoluteUrl` leaves an already-absolute CDN URL alone.
  */
  if (settings.logo?.url) {
    data.logo = /^https?:\/\//i.test(settings.logo.url) ? settings.logo.url : absoluteUrl(settings.logo.url);
  }
  if (settings.defaultSeo?.description) data.description = settings.defaultSeo.description;

  const address = (settings.addressLines ?? []).filter((line) => !unusable(line));
  if (address.length) {
    data.address = { '@type': 'PostalAddress', streetAddress: address.join(', ') };
  }

  // `sameAs` is how a search engine ties the site to its social profiles; only absolute URLs
  // qualify, and the site currently has none configured.
  const sameAs = (settings.socials ?? []).map((s) => s.href).filter((h) => /^https?:/.test(h));
  if (sameAs.length) data.sameAs = sameAs;

  return <JsonLd data={data} />;
}

/**
 * An ordered list of what an index page links to.
 *
 * The services, solutions, industries and technologies pages are listings, and a listing
 * whose only structured data is a breadcrumb tells a search engine nothing about what it
 * contains. `ItemList` names each entry and its URL, which is what lets the set be understood
 * as a group rather than as one page of links.
 */
export function ItemListSchema({
  items,
  path,
}: {
  items: Array<{ name: string; path: string }>;
  path: string;
}) {
  if (!items.length) return null;

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        url: absoluteUrl(path),
        numberOfItems: items.length,
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          url: absoluteUrl(item.path),
        })),
      }}
    />
  );
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
    data.image = /^https?:\/\//i.test(post.coverImage.url)
      ? post.coverImage.url
      : absoluteUrl(post.coverImage.url);
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
