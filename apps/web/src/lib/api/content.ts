import 'server-only';
import { api, tags } from './client';
import type {
  BlogCategory,
  BlogPost,
  BlogPostSummary,
  CaseStudy,
  FaqItem,
  MediaRef,
  Paginated,
  ServicePage,
  SitePage,
  SiteSettings,
  Testimonial,
} from '@aptentech/shared';

/**
 * Typed content reads.
 *
 * Every function names the cache tag it belongs to, so publishing in the CMS invalidates
 * exactly the pages that changed rather than the whole site.
 */

/** A media reference once the API has resolved its stored asset. */
export type ResolvedMedia = MediaRef & { url: string | null };

export type ResolvedServicePage = Omit<ServicePage, 'heroImage' | 'positioningImage'> & {
  heroImage: ResolvedMedia;
  positioningImage: ResolvedMedia;
  caseStudies: CaseStudy[];
  testimonials: Testimonial[];
  latestPosts: BlogPostSummary[];
};

export type ResolvedSitePage = SitePage & {
  caseStudies: CaseStudy[];
  testimonials: Testimonial[];
  latestPosts: BlogPostSummary[];
};

export type ResolvedBlogPost = BlogPost & { related: BlogPostSummary[] };

export interface ServiceSummary {
  id: string;
  slug: string;
  kind: 'service' | 'solution';
  name: string;
  order: number;
  heroTitle: string;
  heroDescription: string;
  updatedAt?: string;
}

export const content = {
  settings: () => api.request<SiteSettings>('/site-settings', { tags: [tags.settings, tags.navigation] }),

  services: () => api.request<ServiceSummary[]>('/services', { tags: [tags.services] }),
  solutions: () => api.request<ServiceSummary[]>('/solutions', { tags: [tags.solutions] }),

  service: (slug: string) =>
    api.optional<ResolvedServicePage>(`/services/${encodeURIComponent(slug)}`, {
      tags: [tags.services, tags.service(slug), tags.caseStudies, tags.testimonials],
    }),

  solution: (slug: string) =>
    api.optional<ResolvedServicePage>(`/solutions/${encodeURIComponent(slug)}`, {
      tags: [tags.solutions, tags.solution(slug), tags.caseStudies, tags.testimonials],
    }),

  industries: () => api.request<ServiceSummary[]>('/industries', { tags: [tags.industries] }),
  technologyPages: () => api.request<ServiceSummary[]>('/technologies', { tags: [tags.technologies] }),

  industry: (slug: string) =>
    api.optional<ResolvedServicePage>(`/industries/${encodeURIComponent(slug)}`, {
      tags: [tags.industries, tags.industry(slug), tags.caseStudies, tags.testimonials],
    }),

  technology: (slug: string) =>
    api.optional<ResolvedServicePage>(`/technologies/${encodeURIComponent(slug)}`, {
      tags: [tags.technologies, tags.technology(slug), tags.caseStudies, tags.testimonials],
    }),

  page: (slug: string) =>
    api.optional<ResolvedSitePage>(`/pages/${encodeURIComponent(slug)}`, {
      tags: [tags.page(slug), tags.caseStudies, tags.testimonials, tags.blog],
    }),

  caseStudies: (page = 1, pageSize = 24) =>
    api.request<Paginated<CaseStudy>>(`/case-studies?page=${page}&pageSize=${pageSize}`, {
      tags: [tags.caseStudies],
    }),

  caseStudy: (slug: string) =>
    api.optional<CaseStudy>(`/case-studies/${encodeURIComponent(slug)}`, {
      tags: [tags.caseStudies, tags.caseStudy(slug)],
    }),

  blog: (page = 1, pageSize = 9, filters: { category?: string; tag?: string } = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filters.category) params.set('category', filters.category);
    if (filters.tag) params.set('tag', filters.tag);
    // Articles change more often than service pages, so they carry a shorter TTL as well
    // as on-demand invalidation.
    return api.request<Paginated<BlogPostSummary>>(`/blog?${params}`, { tags: [tags.blog], revalidate: 900 });
  },

  post: (slug: string) =>
    api.optional<ResolvedBlogPost>(`/blog/${encodeURIComponent(slug)}`, {
      tags: [tags.blog, tags.post(slug)],
      revalidate: 900,
    }),

  blogCategories: () => api.request<BlogCategory[]>('/blog/categories', { tags: [tags.blog] }),

  testimonials: () => api.request<Testimonial[]>('/testimonials', { tags: [tags.testimonials] }),

  faqs: () => api.request<FaqItem[]>('/faqs', { tags: [tags.faqs] }),

  sitemap: () =>
    api.request<{
      services: Array<{ slug: string; updatedAt?: string }>;
      solutions: Array<{ slug: string; updatedAt?: string }>;
      industries: Array<{ slug: string; updatedAt?: string }>;
      technologies: Array<{ slug: string; updatedAt?: string }>;
      posts: Array<{ slug: string; updatedAt?: string; publishedAt?: string }>;
      caseStudies: Array<{ slug: string; updatedAt?: string; detailHref: string | null }>;
      pages: Array<{ slug: string; updatedAt?: string }>;
    }>('/sitemap', { tags: [tags.services, tags.solutions, tags.industries, tags.technologies, tags.blog, tags.caseStudies], revalidate: 3600 }),
};
